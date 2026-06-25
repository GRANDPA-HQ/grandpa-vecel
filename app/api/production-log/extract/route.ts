import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { SUPABASE_URL } from "@/lib/supabase/config"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const FIELDS = [
  "날짜",
  "생산품명",
  "생산품 코드",
  "담당자",
  "시작시간",
  "소요시간",
  "생산량",
  "단계",
  "비고",
]

function buildPrompt(productNames: string[]): string {
  const nameList =
    productNames.length > 0
      ? `\n\n[허용된 생산품명 목록]\n${productNames.map((n) => `- ${n}`).join("\n")}\n\n생산품명 필드는 반드시 위 목록 중 이미지에 적힌 내용과 가장 유사한 항목으로 입력하세요. 목록에 없는 이름은 절대 사용하지 마세요.`
      : ""

  return `당신은 수기로 작성된 생산일지에서 데이터를 추출하는 전문가입니다.
이미지 또는 PDF에서 다음 필드를 찾아 JSON 배열로 반환하세요:
- 날짜 (YYYY-MM-DD 형식, 없으면 빈 문자열)
- 생산품명${nameList}
- 생산품 코드
- 담당자
- 시작시간 (HH:MM 형식, 없으면 빈 문자열)
- 소요시간 (숫자+단위, 예: "2시간", "30분")
- 생산량 (숫자+단위, 예: "100개", "50kg")
- 단계 (생산 공정 단계, 예: "1단계", "포장" 등)
- 비고

여러 행이 있으면 각 행을 별도 객체로 반환하세요.
반드시 순수 JSON만 반환하고, 마크다운 코드 블록이나 설명 텍스트 없이 응답하세요.
형식: [{"날짜":"","생산품명":"","생산품 코드":"","담당자":"","시작시간":"","소요시간":"","생산량":"","단계":"","비고":""}]`
}

async function fetchProductNames(): Promise<string[]> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const [prodRes, rawRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/tb_prod_mst?select=prod_name`, { headers, cache: "no-store" }),
    fetch(`${SUPABASE_URL}/rest/v1/tb_raw_mst?select=raw_name`, { headers, cache: "no-store" }),
  ])
  const names: string[] = []
  if (prodRes.ok) {
    const rows = (await prodRes.json()) as { prod_name: string }[]
    rows.forEach((r) => r.prod_name && names.push(r.prod_name))
  }
  if (rawRes.ok) {
    const rows = (await rawRes.json()) as { raw_name: string }[]
    rows.forEach((r) => r.raw_name && names.push(r.raw_name))
  }
  return [...new Set(names)]
}

// ── 서비스 계정 JWT → Access Token ──────────────────────────────
function b64url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

async function getServiceAccountToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!email || !rawKey) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL 또는 GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY가 .env에 없습니다.")
  }

  // PEM 정규화: 따옴표 제거 + \n → 실제 줄바꿈
  const pem = rawKey
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")

  // PEM 헤더/푸터 제거 후 base64 → ArrayBuffer
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "")
  const keyBuffer = Buffer.from(pemBody, "base64")

  // Web Crypto API로 키 임포트 (OpenSSL 버전 무관)
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )

  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = b64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )

  const sigBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(`${header}.${payload}`),
  )

  const signature = Buffer.from(sigBuffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")

  const jwt = `${header}.${payload}.${signature}`

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })

  const data = (await res.json()) as { access_token?: string; error?: string }
  if (!data.access_token) {
    throw new Error(`서비스 계정 인증 실패: ${data.error ?? JSON.stringify(data)}`)
  }
  return data.access_token
}

// ── Drive URL 파싱 ───────────────────────────────────────────────
function parseDriveUrl(url: string): { id: string; type: "file" | "folder" } | null {
  const folderMatch = url.match(/\/drive\/folders\/([a-zA-Z0-9_\-.]+)/)
  if (folderMatch) return { id: folderMatch[1], type: "folder" }

  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_\-.]+)/)
  if (fileMatch) return { id: fileMatch[1], type: "file" }

  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_\-.]+)/)
  if (idMatch) return { id: idMatch[1], type: "file" }

  return null
}

// ── 폴더 안 이미지 목록 조회 ─────────────────────────────────────
async function listFolderImages(
  folderId: string,
  token: string,
): Promise<{ id: string; name: string; mimeType: string }[]> {
  const q = encodeURIComponent(
    `'${folderId}' in parents and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/webp' or mimeType='image/gif' or mimeType='application/pdf') and trashed=false`,
  )
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=50`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`폴더 파일 목록 조회 실패 (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { files: { id: string; name: string; mimeType: string }[] }
  return data.files ?? []
}

// ── Drive 파일 다운로드 ──────────────────────────────────────────
async function downloadDriveFile(
  fileId: string,
  token: string,
): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!res.ok) throw new Error(`파일 다운로드 실패 (${res.status}): ${fileId}`)

  const contentType = res.headers.get("content-type") ?? "image/jpeg"
  return { bytes: await res.arrayBuffer(), mimeType: contentType.split(";")[0] }
}

// ── Gemini 이미지 분석 ───────────────────────────────────────────
async function extractRowsFromImage(
  bytes: ArrayBuffer,
  mimeType: string,
  productNames: string[],
): Promise<Record<string, string>[]> {
  const base64 = Buffer.from(bytes).toString("base64")
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
  const result = await model.generateContent([
    { inlineData: { data: base64, mimeType } },
    buildPrompt(productNames),
  ])

  let raw = result.response.text().trim()
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()

  let rows: Record<string, string>[]
  try {
    rows = JSON.parse(raw)
    if (!Array.isArray(rows)) rows = [rows]
  } catch {
    return []
  }

  return rows.map((row) => {
    const out: Record<string, string> = {}
    for (const f of FIELDS) out[f] = row[f] ?? ""
    return out
  })
}

// ── POST 핸들러 ──────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("image") as File | null
    const driveUrl = formData.get("driveUrl") as string | null

    if (!file && !driveUrl) {
      return NextResponse.json({ error: "파일 또는 Google Drive 링크가 필요합니다." }, { status: 400 })
    }

    const productNames = await fetchProductNames()
    let allRows: Record<string, string>[] = []

    if (file) {
      const bytes = await file.arrayBuffer()
      allRows = await extractRowsFromImage(bytes, file.type || "image/jpeg", productNames)
      return NextResponse.json({ rows: allRows, fields: FIELDS })
    }

    // Drive 처리
    const parsed = parseDriveUrl(driveUrl!)
    if (!parsed) {
      return NextResponse.json(
        { error: `Google Drive URL 형식을 인식할 수 없습니다.\n입력: ${driveUrl}` },
        { status: 400 },
      )
    }

    const token = await getServiceAccountToken()

    if (parsed.type === "folder") {
      const images = await listFolderImages(parsed.id, token)
      if (images.length === 0) {
        return NextResponse.json({ error: "폴더에 이미지 또는 PDF 파일이 없습니다." }, { status: 400 })
      }

      const results = await Promise.allSettled(
        images.map(async (img) => {
          const { bytes, mimeType } = await downloadDriveFile(img.id, token)
          return extractRowsFromImage(bytes, mimeType, productNames)
        }),
      )

      for (const result of results) {
        if (result.status === "fulfilled") allRows.push(...result.value)
      }

      return NextResponse.json({ rows: allRows, fields: FIELDS, processedImages: images.length })
    } else {
      const { bytes, mimeType } = await downloadDriveFile(parsed.id, token)
      allRows = await extractRowsFromImage(bytes, mimeType, productNames)
      return NextResponse.json({ rows: allRows, fields: FIELDS })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
