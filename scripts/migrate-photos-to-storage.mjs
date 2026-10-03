// 기존 사진(로컬 images/ 폴더 → 안 되면 구글 드라이브)을 Supabase Storage 공개 버킷("item-photos")으로
// 1회성으로 옮기는 스크립트. tb_raw_mst(raw_code)/tb_submat_mst(submat_id) 전 품목을 돌면서
// 코드에 해당하는 사진을 찾아 원본 + 썸네일(320px)을 raw/{code}.ext / submat/{code}.ext 로 업로드한다.
//
// 실행: node --env-file=.env scripts/migrate-photos-to-storage.mjs
// (Node 20엔 전역 WebSocket이 없어 supabase-js 생성 시 에러가 나므로, 없으면 아래에서 ws로 폴백한다.
//  최초 1회 `npm install --no-save ws`가 필요할 수 있다 — package.json에는 남기지 않는다.)

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createRequire } from "module"

// sharp(및 그 package.json의 "with { type: 'json' }" import attribute)가 이 Node 버전의 ESM
// 로더에서 바로 안 열려서, CJS 진입점을 require로 불러온다.
const require = createRequire(import.meta.url)
const sharp = require("sharp")

if (typeof globalThis.WebSocket === "undefined") {
  try {
    const { default: WS } = await import("ws")
    globalThis.WebSocket = WS
  } catch {
    console.error("전역 WebSocket이 없고 'ws' 패키지도 없습니다. 먼저 `npm install --no-save ws`를 실행해주세요.")
    process.exit(1)
  }
}

const { createClient } = await import("@supabase/supabase-js")

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/.."
const IMAGES_DIR = path.join(ROOT, "images")
const CACHE_DIR = path.join(ROOT, ".image-cache")

const BUCKET = "item-photos"
const THUMB_SIZE = 320
// 로컬/드라이브에 실제로 존재할 수 있는 원본 확장자 — tif/tiff는 Storage 버킷이 받지 않는 포맷이라
// 발견하면 jpg로 재인코딩해서 올린다(업로드 포맷은 jpg/png/gif/webp 4종으로 고정).
const LEGACY_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "tif", "tiff"]

const CODE_RE = /^(?:(?:RAW|PROD)-)?([A-Z][A-Z0-9_]*)[-_](\d+)$/i

function parseImageCode(code) {
  const m = code.match(CODE_RE)
  if (!m) return null
  return { category: m[1].toUpperCase(), num: m[2] }
}

function tryRead(p) {
  return fs.existsSync(p) ? fs.readFileSync(p) : null
}

function findLocalFile(category, num) {
  for (const ext of LEGACY_EXTS) {
    const filename = `${category}-${num}.${ext}`
    const buf = tryRead(path.join(IMAGES_DIR, category, filename)) ?? tryRead(path.join(CACHE_DIR, category, filename))
    if (buf) return { buf, ext }
  }
  return null
}

// 구글 드라이브는 GOOGLE_DRIVE_FOLDER_ID까지 설정돼야 켜진다 — 지금 .env엔 이메일/키만 있고
// 폴더 ID가 비어 있어 비활성 상태다(확인됨). 나중에 채워지면 이 스크립트를 다시 돌려도 안전하다
// (업로드가 upsert라 이미 옮겨진 사진은 덮어쓰기만 될 뿐).
function isDriveConfigured() {
  return !!(process.env.GOOGLE_DRIVE_CLIENT_EMAIL && process.env.GOOGLE_DRIVE_PRIVATE_KEY && process.env.GOOGLE_DRIVE_FOLDER_ID)
}

let driveClient = null
async function getDriveClient() {
  if (driveClient) return driveClient
  const { JWT } = await import("google-auth-library")
  driveClient = new JWT({
    email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    key: process.env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  })
  return driveClient
}

async function findDriveFile(category, num) {
  if (!isDriveConfigured()) return null
  const auth = await getDriveClient()
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  for (const ext of LEGACY_EXTS) {
    const filename = `${category}-${num}.${ext}`
    const escaped = filename.replace(/'/g, "\\'")
    const q = `'${folderId}' in parents and name = '${escaped}' and trashed = false`
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`
    const res = await auth.request({ url })
    const fileId = res.data.files?.[0]?.id
    if (!fileId) continue
    const dl = await auth.request({ url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, responseType: "arraybuffer" })
    return { buf: Buffer.from(dl.data), ext }
  }
  return null
}

// 발견한 원본(any ext)을 업로드 가능한 4종(jpg/png/gif/webp)으로 정규화한다.
async function normalizeForUpload(buf, ext) {
  const e = ext.toLowerCase()
  if (e === "jpeg") return { buf, ext: "jpg", contentType: "image/jpeg" }
  if (e === "jpg") return { buf, ext: "jpg", contentType: "image/jpeg" }
  if (e === "png") return { buf, ext: "png", contentType: "image/png" }
  if (e === "gif") return { buf, ext: "gif", contentType: "image/gif" }
  if (e === "webp") return { buf, ext: "webp", contentType: "image/webp" }
  // tif/tiff 등 나머지는 jpg로 재인코딩
  const jpeg = await sharp(buf).jpeg({ quality: 90 }).toBuffer()
  return { buf: jpeg, ext: "jpg", contentType: "image/jpeg" }
}

async function migrateOne(supabase, domain, code) {
  const parsed = parseImageCode(code)
  if (!parsed) return { code, status: "skip", reason: "코드 형식 불일치" }

  const { category, num } = parsed
  const found = findLocalFile(category, num) ?? (await findDriveFile(category, num))
  if (!found) return { code, status: "missing" }

  let normalized
  try {
    normalized = await normalizeForUpload(found.buf, found.ext)
  } catch (e) {
    return { code, status: "error", reason: `원본 변환 실패: ${e.message}` }
  }

  let thumbBuf
  try {
    thumbBuf = await sharp(normalized.buf).resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true }).toBuffer()
  } catch (e) {
    return { code, status: "error", reason: `썸네일 생성 실패: ${e.message}` }
  }

  const fullPath = `${domain}/${code}.${normalized.ext}`
  const thumbPath = `${domain}/${code}_thumb.${normalized.ext}`
  const storage = supabase.storage.from(BUCKET)

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    storage.upload(fullPath, normalized.buf, { contentType: normalized.contentType, upsert: true }),
    storage.upload(thumbPath, thumbBuf, { contentType: normalized.contentType, upsert: true }),
  ])
  if (e1) return { code, status: "error", reason: `업로드 실패: ${e1.message}` }
  if (e2) return { code, status: "error", reason: `썸네일 업로드 실패: ${e2.message}` }

  return { code, status: "ok", path: fullPath }
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: rawRows, error: rawErr } = await supabase.from("tb_raw_mst").select("raw_code")
  if (rawErr) throw new Error(`tb_raw_mst 조회 실패: ${rawErr.message}`)
  const { data: submatRows, error: submatErr } = await supabase.from("tb_submat_mst").select("submat_id")
  if (submatErr) throw new Error(`tb_submat_mst 조회 실패: ${submatErr.message}`)

  console.log(`원재료 ${rawRows.length}건, 부자재 ${submatRows.length}건 확인. 드라이브 사용: ${isDriveConfigured()}`)

  const results = []
  for (const row of rawRows) results.push(await migrateOne(supabase, "raw", row.raw_code))
  for (const row of submatRows) results.push(await migrateOne(supabase, "submat", row.submat_id))

  const ok = results.filter((r) => r.status === "ok")
  const missing = results.filter((r) => r.status === "missing")
  const skip = results.filter((r) => r.status === "skip")
  const errors = results.filter((r) => r.status === "error")

  console.log(`\n이관 완료: ${ok.length}건`)
  if (skip.length) console.log(`코드 형식 불일치로 건너뜀: ${skip.length}건 → ${skip.map((r) => r.code).join(", ")}`)
  if (errors.length) {
    console.log(`\n실패 ${errors.length}건:`)
    for (const e of errors) console.log(`  ${e.code}: ${e.reason}`)
  }
  console.log(`\n사진 없음 ${missing.length}건 (앱에서 직접 업로드 필요):`)
  for (const m of missing) console.log(`  ${m.code}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
