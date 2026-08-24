import { NextRequest, NextResponse } from "next/server"
import path from "path"
import { resolveImageFile } from "@/lib/photo-resolve"

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params
  if (segments.some((s) => s.includes("..") || s.includes("/") || s.includes("\\"))) {
    return new NextResponse("Forbidden", { status: 403 })
  }
  const [category, filename] = segments.slice(-2)
  if (!category || !filename) return new NextResponse("Not Found", { status: 404 })

  const buffer = await resolveImageFile(category, filename)
  if (!buffer) return new NextResponse("Not Found", { status: 404 })

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": contentTypeFor(filename), "Cache-Control": "public, max-age=86400" },
  })
}
