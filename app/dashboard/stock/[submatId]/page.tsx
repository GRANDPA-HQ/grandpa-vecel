import { redirect, notFound } from "next/navigation"
import { getCurrentEmployee } from "@/lib/permissions"
import {
  getSubmatStockMaster,
  getSubmatStockFor,
  getSubmatCategoriesFull,
  getActiveStorageAreas,
  getAreaIdsForSubmat,
  getSubmatRecentTxns,
} from "@/lib/supabase/db"
import { StockDetail } from "@/components/stock/stock-detail"

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ submatId: string }>
}) {
  const { submatId } = await params
  const decoded = decodeURIComponent(submatId)

  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  if (!employee.storeId) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        소속 매장이 없어 재고를 조회할 수 없습니다.
      </div>
    )
  }

  const master = await getSubmatStockMaster(decoded)
  if (!master) notFound()

  const [{ stock, hold }, categories, activeAreas, areaIds, txns] = await Promise.all([
    getSubmatStockFor(employee.storeId, decoded),
    getSubmatCategoriesFull(),
    getActiveStorageAreas(employee.storeId),
    getAreaIdsForSubmat(decoded),
    getSubmatRecentTxns(employee.storeId, decoded, 20),
  ])

  const category = categories.find((c) => c.code === master.categoryCode)
  const activeAreaIdSet = new Set(activeAreas.map((a) => a.id))
  const mappedAreaNames = activeAreas.filter((a) => areaIds.includes(a.id) && activeAreaIdSet.has(a.id)).map((a) => a.name)

  return (
    <StockDetail
      master={master}
      categoryName={category?.name ?? master.categoryCode ?? "-"}
      stock={stock}
      hold={hold}
      mappedAreaNames={mappedAreaNames}
      recentTxns={txns}
    />
  )
}
