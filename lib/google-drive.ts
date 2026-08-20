import "server-only"
import { JWT } from "google-auth-library"

// 구글 드라이브에서 사진을 읽어오기 위한 서비스 계정 인증.
// 필요 환경변수: GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID
// (.env에 GOOGLE_DRIVE_PRIVATE_KEY를 저장할 때 JSON 키의 개행이 "\n" 두 글자로 들어가므로 아래에서 복원한다)

let client: JWT | null = null

function getClient(): JWT | null {
  const email = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
  const key = process.env.GOOGLE_DRIVE_PRIVATE_KEY
  if (!email || !key) return null
  if (!client) {
    client = new JWT({
      email,
      key: key.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    })
  }
  return client
}

// 환경변수가 아직 설정되지 않았으면 드라이브 조회 자체를 건너뛸 수 있도록 별도로 노출
export function isDriveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_DRIVE_CLIENT_EMAIL &&
    process.env.GOOGLE_DRIVE_PRIVATE_KEY &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  )
}

// 지정한 폴더(GOOGLE_DRIVE_FOLDER_ID) 안에서 파일명이 정확히 일치하는 파일을 찾는다.
// (파일명에 작은따옴표가 있으면 Drive query 문법에서 이스케이프 필요)
export async function findDriveFileByName(fileName: string): Promise<string | null> {
  const auth = getClient()
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!auth || !folderId) return null

  const escaped = fileName.replace(/'/g, "\\'")
  const q = `'${folderId}' in parents and name = '${escaped}' and trashed = false`
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`

  const res = await auth.request<{ files?: { id: string; name: string }[] }>({ url })
  return res.data.files?.[0]?.id ?? null
}

// 파일 ID로 실제 이미지 바이트를 내려받는다.
export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const auth = getClient()
  if (!auth) throw new Error("Google Drive가 설정되지 않았습니다.")

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  const res = await auth.request<ArrayBuffer>({ url, responseType: "arraybuffer" })
  return Buffer.from(res.data)
}
