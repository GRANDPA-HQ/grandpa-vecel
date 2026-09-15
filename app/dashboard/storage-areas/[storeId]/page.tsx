import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { getCurrentEmployee } from "@/lib/permissions"
import { createAdminClient } from "@/lib/supabase/admin"
import { StorageAreaManager, type StorageAreaRow } from "@/components/storage-area-manager"

export default async function StorageAreasPage({
  params,
}: {
  params: Promise<{ storeId: string }>
}) {
  const { storeId } = await params

  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  if (!employee.isSenior) redirect("/dashboard/forbidden")

  const admin = createAdminClient()

  const { data: store } = await admin
    .from("tb_store_mst")
    .select("id, store_code, store_name")
    .eq("id", storeId)
    .maybeSingle()
  if (!store) notFound()

  const { data: areaRows } = await admin
    .from("tb_storage_area_mst")
    .select("id, area_name, sort_order, is_active")
    .eq("store_id", storeId)
    .order("sort_order", { ascending: true })
  const areas = areaRows ?? []
  const areaIds = areas.map((a) => a.id as string)

  let linksByArea: Record<string, string[]> = {}
  let categoryNamesBySubmat: Record<string, string[]> = {}
  if (areaIds.length > 0) {
    const { data: links } = await admin
      .from("tb_submat_storage_area_link")
      .select("area_id, submat_id")
      .in("area_id", areaIds)
    for (const link of links ?? []) {
      const areaId = link.area_id as string
      ;(linksByArea[areaId] ??= []).push(link.submat_id as string)
    }

    const submatIds = Array.from(new Set((links ?? []).map((l) => l.submat_id as string)))
    if (submatIds.length > 0) {
      const { data: submats } = await admin
        .from("tb_submat_mst")
        .select("submat_id, category_code")
        .in("submat_id", submatIds)
      const categoryCodeBySubmat = new Map(
        (submats ?? []).map((s) => [s.submat_id as string, s.category_code as string | null]),
      )
      const categoryCodes = Array.from(new Set(Array.from(categoryCodeBySubmat.values()).filter(Boolean))) as string[]

      let categoryNameByCode: Record<string, string> = {}
      if (categoryCodes.length > 0) {
        const { data: categories } = await admin
          .from("tb_submat_category_mst")
          .select("category_code, category_name")
          .in("category_code", categoryCodes)
        categoryNameByCode = Object.fromEntries(
          (categories ?? []).map((c) => [c.category_code as string, (c.category_name as string) ?? c.category_code as string]),
        )
      }

      categoryNamesBySubmat = Object.fromEntries(
        submatIds.map((id) => {
          const code = categoryCodeBySubmat.get(id)
          return [id, code ? [categoryNameByCode[code] ?? code] : []]
        }),
      )
    }
  }

  const areaData: StorageAreaRow[] = areas.map((a) => {
    const submatIds = linksByArea[a.id as string] ?? []
    const categoryTags = Array.from(
      new Set(submatIds.flatMap((sid) => categoryNamesBySubmat[sid] ?? [])),
    )
    return {
      id: a.id as string,
      areaName: a.area_name as string,
      sortOrder: a.sort_order as number,
      isActive: a.is_active as boolean,
      mappedCount: submatIds.length,
      categoryTags,
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard/data-table/tb_store_mst"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-emerald-700"
        >
          <ChevronLeft className="h-4 w-4" />
          지점 관리
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-md bg-emerald-700 px-2.5 py-1 font-mono text-xs font-bold text-white">
            {store.store_code as string}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{store.store_name as string} 보관영역</h1>
        <p className="text-sm text-muted-foreground">
          부자재를 실제로 쌓아두는 물리적 구역입니다. 스태프 실사는 아래 순서대로 진행됩니다.
        </p>
      </div>

      <StorageAreaManager storeId={storeId} initialAreas={areaData} />
    </div>
  )
}
