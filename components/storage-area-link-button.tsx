import Link from "next/link"
import { Archive } from "lucide-react"

export function StorageAreaLinkButton({
  storeId,
  activeCount,
}: {
  storeId: string
  activeCount: number
}) {
  return (
    <Link
      href={`/dashboard/storage-areas/${storeId}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-600 hover:text-white"
    >
      <Archive className="h-3.5 w-3.5" />
      보관영역 관리
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
        {activeCount}
      </span>
    </Link>
  )
}
