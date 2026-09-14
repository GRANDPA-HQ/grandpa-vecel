import { redirect } from "next/navigation"
import { getCurrentEmployee } from "@/lib/permissions"
import {
  getSubmatStockMasters,
  getSubmatStockTotals,
  getSubmatCategoriesFull,
  getActiveStorageAreas,
  getSubmatAreaLinksByStore,
} from "@/lib/supabase/db"
import { StockList, type StockCardData } from "@/components/stock/stock-list"
import { statusOf } from "@/lib/submat-stock"

export default async function StockListPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  if (!employee.storeId) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        소속 매장이 없어 재고를 조회할 수 없습니다.
      </div>
    )
  }

  const [masters, totals, categories, areas, links] = await Promise.all([
    getSubmatStockMasters(),
    getSubmatStockTotals(employee.storeId),
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
  const areaSortById = new Map(areas.map((a) => [a.id, a.sortOrder]))
  for (const ids of Object.values(areaIdsBySubmat)) {
    ids.sort((a, b) => (areaSortById.get(a) ?? 0) - (areaSortById.get(b) ?? 0))
  }

  const items: StockCardData[] = masters.map((m) => {
    const stock = totals.stockBySubmat[m.submatId] ?? 0
    return {
      submatId: m.submatId,
      itemName: m.itemName,
      categoryCode: m.categoryCode,
      spec: m.spec,
      packsPerBox: m.packsPerBox,
      minStockPack: m.minStockPack,
      stock,
      hold: totals.holdBySubmat[m.submatId] ?? 0,
      status: statusOf(stock, m.minStockPack),
      areaIds: areaIdsBySubmat[m.submatId] ?? [],
    }
  })

  return (
    <StockList
      items={items}
      categories={categories}
      areas={areas}
      storeName={employee.storeName ?? ""}
    />
  )
}
