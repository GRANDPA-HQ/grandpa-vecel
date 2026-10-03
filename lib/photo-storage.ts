// 원재료/부자재 사진 — Supabase Storage 공개 버킷("item-photos") 경로 규칙.
// 클라이언트(PhotoCell)와 서버(app/actions/item-photos.ts)가 같은 경로를 계산해야 하므로
// "server-only"가 아닌 순수 함수만 여기 모은다(비밀키 없이 NEXT_PUBLIC_SUPABASE_URL만 사용).
export const ITEM_PHOTOS_BUCKET = "item-photos"

export type PhotoDomain = "raw" | "submat"

// "photo_urls" 컬럼에 코드 기반으로 사진을 보여주는 테이블 → 사진이 저장되는 도메인 폴더
export const PHOTO_DOMAIN_BY_TABLE: Record<string, PhotoDomain> = {
  tb_raw_mst: "raw",
  tb_submat_mst: "submat",
}

export const IMAGE_EXTS = ["jpg", "png", "gif", "webp"] as const
export type ImageExt = (typeof IMAGE_EXTS)[number]

const MIME_TO_EXT: Record<string, ImageExt> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
}

export function extFromMime(mime: string): ImageExt | null {
  return MIME_TO_EXT[mime] ?? null
}

export function itemPhotoPath(domain: PhotoDomain, code: string, ext: string, thumb = false): string {
  return `${domain}/${code}${thumb ? "_thumb" : ""}.${ext}`
}

export function publicItemPhotoUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")
  return `${base}/storage/v1/object/public/${ITEM_PHOTOS_BUCKET}/${path}`
}
