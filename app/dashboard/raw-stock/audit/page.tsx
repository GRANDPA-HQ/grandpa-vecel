import { redirect } from "next/navigation"
import { getCurrentEmployee } from "@/lib/permissions"
import { getRawStockAuditActor } from "@/lib/raw-stock-session"
import { getWorkingStaffForRawStock, verifyRawStockPinAudit } from "@/app/actions/raw-stock-auth"
import { getRawStockMasters, getRawStockTotals, getRawCategoriesFull } from "@/lib/supabase/db"
import { RawStockAuthGate } from "@/components/stock/raw-stock-auth-gate"
import { RawStockAudit, type AuditItem } from "@/components/stock/raw-stock-audit"

export default async function RawStockAuditPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  if (!employee.storeId) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        소속 매장이 없어 재고를 조회할 수 없습니다.
      </div>
    )
  }

  // 실사는 설계서상 별도 PIN이 필요하다 — 입고/폐기 세션(raw_stock_actor)이 있어도 다시 인증한다.
  const actorId = await getRawStockAuditActor()
  if (!actorId) {
    const result = await getWorkingStaffForRawStock()
    if ("error" in result) {
      return <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{result.error}</div>
    }
    return (
      <RawStockAuthGate
        targetLabel="원재료 재고 실사"
        targetPartCode="KP"
        staff={result.staff}
        onVerify={verifyRawStockPinAudit}
      />
    )
  }

  const [masters, totals, categories] = await Promise.all([
    getRawStockMasters(),
    getRawStockTotals(employee.storeId),
    getRawCategoriesFull(),
  ])

  const items: AuditItem[] = masters.map((m) => ({
    rawCode: m.rawCode,
    rawName: m.rawName,
    categoryCode: m.categoryCode,
    storage: m.storage,
    countSize: m.countSize,
    countUnit: m.countUnit,
    systemStock: totals.stockByRaw[m.rawCode] ?? 0,
  }))

  return <RawStockAudit items={items} categories={categories} />
}
