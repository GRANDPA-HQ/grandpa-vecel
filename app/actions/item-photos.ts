"use server"

import sharp from "sharp"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"
import {
  ITEM_PHOTOS_BUCKET,
  IMAGE_EXTS,
  extFromMime,
  itemPhotoPath,
  publicItemPhotoUrl,
  PHOTO_DOMAIN_BY_TABLE,
} from "@/lib/photo-storage"

// 원재료(tb_raw_mst)/부자재(tb_submat_mst) 사진 업로드 — 관리자 데이터 테이블 화면(PhotoCell)에서
// 품목 코드(raw_code/submat_id)를 그대로 파일명으로 써서 Supabase Storage 공개 버킷에 올린다.
// 드라이브 경유 없이 앱에서 바로 올리는 방식으로, 원본 + 썸네일(320px) 두 장을 함께 저장한다.

const MAX_BYTES = 8 * 1024 * 1024
const THUMB_SIZE = 320

type UploadResult = { url?: string; thumbUrl?: string; error?: string }
type DeleteResult = { success?: boolean; error?: string }

function staleVariantPaths(domain: "raw" | "submat", code: string): string[] {
  return IMAGE_EXTS.flatMap((ext) => [itemPhotoPath(domain, code, ext), itemPhotoPath(domain, code, ext, true)])
}

export async function uploadItemPhoto(tableName: string, code: string, formData: FormData): Promise<UploadResult> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }

  const domain = PHOTO_DOMAIN_BY_TABLE[tableName]
  if (!domain) return { error: "지원하지 않는 테이블입니다." }
  if (!code) return { error: "품목 코드가 없습니다." }

  const file = formData.get("file")
  if (!(file instanceof File)) return { error: "파일이 없습니다." }
  if (file.size === 0) return { error: "빈 파일입니다." }
  if (file.size > MAX_BYTES) return { error: "파일이 너무 큽니다 (최대 8MB)." }

  const ext = extFromMime(file.type)
  if (!ext) return { error: "jpg·png·gif·webp 파일만 올릴 수 있습니다." }

  const bytes = Buffer.from(await file.arrayBuffer())

  let thumbBytes: Buffer
  try {
    thumbBytes = await sharp(bytes)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
      .toBuffer()
  } catch {
    return { error: "이미지 파일을 읽을 수 없습니다." }
  }

  const admin = createAdminClient()
  const storage = admin.storage.from(ITEM_PHOTOS_BUCKET)

  // 이전에 다른 확장자로 올라와 있던 파일이 남지 않도록, 가능한 확장자 전부를 먼저 정리한다.
  await storage.remove(staleVariantPaths(domain, code))

  const fullPath = itemPhotoPath(domain, code, ext)
  const thumbPath = itemPhotoPath(domain, code, ext, true)

  const [{ error: fullError }, { error: thumbError }] = await Promise.all([
    storage.upload(fullPath, bytes, { contentType: file.type, upsert: true }),
    storage.upload(thumbPath, thumbBytes, { contentType: file.type, upsert: true }),
  ])
  if (fullError) return { error: `업로드에 실패했습니다. ${fullError.message}` }
  if (thumbError) return { error: `썸네일 업로드에 실패했습니다. ${thumbError.message}` }

  revalidatePath(`/dashboard/data-table/${tableName}`)
  return { url: publicItemPhotoUrl(fullPath), thumbUrl: publicItemPhotoUrl(thumbPath) }
}

export async function removeItemPhoto(tableName: string, code: string): Promise<DeleteResult> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }

  const domain = PHOTO_DOMAIN_BY_TABLE[tableName]
  if (!domain) return { error: "지원하지 않는 테이블입니다." }
  if (!code) return { error: "품목 코드가 없습니다." }

  const admin = createAdminClient()
  const { error } = await admin.storage.from(ITEM_PHOTOS_BUCKET).remove(staleVariantPaths(domain, code))
  if (error) return { error: error.message }

  revalidatePath(`/dashboard/data-table/${tableName}`)
  return { success: true }
}
