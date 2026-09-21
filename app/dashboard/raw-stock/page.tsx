import { redirect } from "next/navigation"
import { getCurrentEmployee } from "@/lib/permissions"
import { getRawStockActor } from "@/lib/raw-stock-session"
import { getWorkingStaffForRawStock, verifyRawStockPinStandard } from "@/app/actions/raw-stock-auth"
import { getRawStockMasters, getRawStockTotals, getRawCategoriesFull } from "@/lib/supabase/db"
import { RawStockAuthGate } from "@/components/stock/raw-stock-auth-gate"
import { RawStockList, type RawStockCardData } from "@/components/stock/raw-stock-list"
import { statusOf } from "@/lib/raw-stock"

export default async function RawStockPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  if (!employee.storeId) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        소속 매장이 없어 재고를 조회할 수 없습니다.
      </div>
    )
  }

  const actorId = await getRawStockActor()
  if (!actorId) {
    const result = await getWorkingStaffForRawStock()
    if ("error" in result) {
      return <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{result.error}</div>
    }
    return (
      <RawStockAuthGate
        targetLabel="원재료 재고"
        targetPartCode="KP"
        staff={result.staff}
        onVerify={verifyRawStockPinStandard}
      />
    )
  }

  const [masters, totals, categories] = await Promise.all([
    getRawStockMasters(),
    getRawStockTotals(employee.storeId),
    getRawCategoriesFull(),
  ])

  const items: RawStockCardData[] = masters.map((m) => {
    const stock = totals.stockByRaw[m.rawCode] ?? 0
    return {
      rawCode: m.rawCode,
      rawName: m.rawName,
      categoryCode: m.categoryCode,
      storage: m.storage,
      countSize: m.countSize,
      countUnit: m.countUnit,
      minStock: m.minStock,
      stock,
      hold: totals.holdByRaw[m.rawCode] ?? 0,
      status: statusOf(stock, m.minStock),
    }
  })

  return <RawStockList items={items} categories={categories} storeName={employee.storeName ?? ""} />
}
