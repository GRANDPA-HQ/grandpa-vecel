import "server-only"
import fs from "fs"
import path from "path"
import { isDriveConfigured, findDriveFileByName, downloadDriveFile } from "@/lib/google-drive"
import { IMAGE_EXTS } from "@/lib/image-code"

// 사진 조회 우선순위: (1) 저장소에 커밋된 images/ 폴더 → (2) 구글 드라이브에서 받아 캐시해둔
// .image-cache/ 폴더 → (3) 구글 드라이브에서 직접 조회 후 캐시. 화면(app/api/images)과
// 엑셀 추출(app/api/export)이 같은 사진을 보여주도록 이 로직을 한 곳에 모아 공유한다.
const IMAGES_DIR = path.join(process.cwd(), "images")
const CACHE_DIR = path.join(process.cwd(), ".image-cache")

function tryReadFile(filePath: string): Buffer | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null
}

/**
 * category/filename(확장자 포함)에 해당하는 사진 파일을 로컬 → 캐시 → 구글 드라이브 순으로 찾는다.
 */
export async function resolveImageFile(category: string, filename: string): Promise<Buffer | null> {
  const local = tryReadFile(path.join(IMAGES_DIR, category, filename))
  if (local) return local

  const cachePath = path.join(CACHE_DIR, category, filename)
  const cached = tryReadFile(cachePath)
  if (cached) return cached

  if (!isDriveConfigured()) return null
  try {
    const fileId = await findDriveFileByName(filename)
    if (!fileId) return null
    const buffer = await downloadDriveFile(fileId)
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
    fs.writeFileSync(cachePath, buffer)
    return buffer
  } catch (e) {
    console.error("[photo-resolve] Google Drive 조회 실패:", e)
    return null
  }
}

/**
 * category-num(예: BEV-001)로 시작하는 사진을, 등록된 확장자를 순서대로 시도해 찾는다.
 * 화면(PhotoCell/CodeImageCell)이 확장자를 모를 때 여러 개를 순서대로 시도하는 것과 동일한 방식.
 */
export async function resolveImageByCode(category: string, num: string): Promise<{ buffer: Buffer; ext: string } | null> {
  for (const ext of IMAGE_EXTS) {
    const filename = `${category}-${num}.${ext}`
    const buffer = await resolveImageFile(category, filename)
    if (buffer) return { buffer, ext }
  }
  return null
}
