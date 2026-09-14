import { redirect } from "next/navigation"
import { getCurrentEmployee } from "@/lib/permissions"
import {
  getActiveStorageAreas,
  getSubmatStockMasters,
  getSubmatStockTotals,
  getSubmatAreaLinksByStore,
} from "@/lib/supabase/db"
import { CycleCount, type CycleCountItem } from "@/components/stock/cycle-count"

export default async function CycleCountPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  if (!employee.storeId) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        소속 매장이 없어 정기실사를 진행할 수 없습니다.
      </div>
    )
  }

  const [areas, masters, totals, links] = await Promise.all([
    getActiveStorageAreas(employee.storeId),
    getSubmatStockMasters(),
    getSubmatStockTotals(employee.storeId),
    getSubmatAreaLinksByStore(employee.storeId),
  ])

  const activeAreaIds = new Set(areas.map((a) => a.id))
  const areaIdsBySubmat: Record<string, string[]> = {}
  for (const link of links) {
    if (!activeAreaIds.has(link.areaId)) continue
    ;(areaIdsBySubmat[link.submatId] ??= []).push(link.areaId)
  }
  const areaSortById = new Map(areas.map((a) => [a.id, a.sortOrder]))
  for (const ids of Object.values(areaIdsBySubmat)) {
    ids.sort((a, b) => (areaSortById.get(a) ?? 0) - (areaSortById.get(b) ?? 0))
  }

  const items: CycleCountItem[] = masters
    .filter((m) => (areaIdsBySubmat[m.submatId] ?? []).length > 0)
    .map((m) => ({
      submatId: m.submatId,
      itemName: m.itemName,
      categoryCode: m.categoryCode,
      areaIds: areaIdsBySubmat[m.submatId] ?? [],
      systemStock: totals.stockBySubmat[m.submatId] ?? 0,
    }))

  return <CycleCount areas={areas} items={items} />
}
