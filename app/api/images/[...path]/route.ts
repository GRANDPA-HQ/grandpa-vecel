import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { isDriveConfigured, findDriveFileByName, downloadDriveFile } from "@/lib/google-drive"

const IMAGES_DIR = path.join(process.cwd(), "images")
// 구글 드라이브에서 내려받은 사진을 캐시해두는 디렉토리 (git에는 커밋하지 않음 — .gitignore 처리)
// 캐시가 있으면 이후 요청은 드라이브 API를 다시 호출하지 않고 여기서 바로 서빙한다
const CACHE_DIR = path.join(process.cwd(), ".image-cache")

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
}

function contentTypeFor(filePath: string): string {
  return MIME_MAP[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"
}

function serveFile(filePath: string): NextResponse {
  const buffer = fs.readFileSync(filePath)
  return new NextResponse(buffer, {
    headers: { "Content-Type": contentTypeFor(filePath), "Cache-Control": "public, max-age=86400" },
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params

  // 기존 git 커밋 사진 (images/카테고리/파일명) — 계속 우선 지원
  const filePath = path.join(IMAGES_DIR, ...segments)
  if (!filePath.startsWith(IMAGES_DIR)) {
    return new NextResponse("Forbidden", { status: 403 })
  }
  if (fs.existsSync(filePath)) {
    return serveFile(filePath)
  }

  // 구글 드라이브에서 내려받아 캐시해둔 사진
  const cachePath = path.join(CACHE_DIR, ...segments)
  if (!cachePath.startsWith(CACHE_DIR)) {
    return new NextResponse("Forbidden", { status: 403 })
  }
  if (fs.existsSync(cachePath)) {
    return serveFile(cachePath)
  }

  // 캐시에 없으면 구글 드라이브에서 조회 (환경변수 미설정 시 건너뜀)
  if (isDriveConfigured()) {
    const fileName = segments[segments.length - 1]
    try {
      const fileId = await findDriveFileByName(fileName)
      if (fileId) {
        const buffer = await downloadDriveFile(fileId)
        fs.mkdirSync(path.dirname(cachePath), { recursive: true })
        fs.writeFileSync(cachePath, buffer)
        return new NextResponse(buffer, {
          headers: { "Content-Type": contentTypeFor(cachePath), "Cache-Control": "public, max-age=86400" },
        })
      }
    } catch (e) {
      console.error("[images] Google Drive 조회 실패:", e)
    }
  }

  return new NextResponse("Not Found", { status: 404 })
}
