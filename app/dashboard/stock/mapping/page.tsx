import { redirect } from "next/navigation"
import { getCurrentEmployee } from "@/lib/permissions"
import {
  getSubmatStockMasters,
  getSubmatCategoriesFull,
  getActiveStorageAreas,
  getSubmatAreaLinksByStore,
} from "@/lib/supabase/db"
import { SubmatAreaMapping, type MappingItem } from "@/components/stock/submat-area-mapping"

export default async function SubmatAreaMappingPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  if (!employee.storeId) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        소속 매장이 없어 보관영역 매핑을 진행할 수 없습니다.
      </div>
    )
  }

  const [masters, categories, areas, links] = await Promise.all([
    getSubmatStockMasters(),
    getSubmatCategoriesFull(),
    getActiveStorageAreas(employee.storeId),
    getSubmatAreaLinksByStore(employee.storeId),
  ])

  const activeAreaIds = new Set(areas.map((a) => a.id))
  const areaIdsBySubmat: Record<string, string[]> = {}
  for (const link of links) {
    if (!activeAreaIds.has(link.areaId)) continue
    ;(areaIdsBySubmat[link.submatId] ??= []).push(link.areaId)
  }

  const items: MappingItem[] = masters.map((m) => ({
    submatId: m.submatId,
    itemName: m.itemName,
    categoryCode: m.categoryCode,
    areaIds: areaIdsBySubmat[m.submatId] ?? [],
  }))

  return <SubmatAreaMapping items={items} categories={categories} areas={areas} />
}
