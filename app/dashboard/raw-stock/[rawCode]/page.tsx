import { redirect, notFound } from "next/navigation"
import { getCurrentEmployee } from "@/lib/permissions"
import { getRawStockActor } from "@/lib/raw-stock-session"
import { getWorkingStaffForRawStock, verifyRawStockPinStandard } from "@/app/actions/raw-stock-auth"
import { getRawStockMaster, getRawStockFor, getRawRecentTxns, getRawCategoriesFull } from "@/lib/supabase/db"
import { RawStockAuthGate } from "@/components/stock/raw-stock-auth-gate"
import { RawStockDetail } from "@/components/stock/raw-stock-detail"

export default async function RawStockDetailPage({ params }: { params: Promise<{ rawCode: string }> }) {
  const { rawCode } = await params
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

  const [master, categories] = await Promise.all([getRawStockMaster(rawCode), getRawCategoriesFull()])
  if (!master) notFound()

  const [{ stock, hold }, recentTxns] = await Promise.all([
    getRawStockFor(employee.storeId, rawCode),
    getRawRecentTxns(employee.storeId, rawCode),
  ])

  const category = master.categoryCode ? categories.find((c) => c.code === master.categoryCode) : undefined

  return <RawStockDetail master={master} category={category} stock={stock} hold={hold} recentTxns={recentTxns} />
}
