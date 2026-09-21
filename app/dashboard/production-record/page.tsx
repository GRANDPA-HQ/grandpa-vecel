import { redirect } from "next/navigation"
import { getCurrentEmployee } from "@/lib/permissions"
import { getProdLogActor } from "@/lib/prod-log-session"
import { getWorkingStaffForRawStock } from "@/app/actions/raw-stock-auth"
import { verifyProdLogPin } from "@/app/actions/prod-log-auth"
import { getProdLogItems, getRawCategoriesFull } from "@/lib/supabase/db"
import { RawStockAuthGate } from "@/components/stock/raw-stock-auth-gate"
import { ProductionRecord } from "@/components/production/production-record"

export default async function ProductionRecordPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  if (!employee.storeId) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        소속 매장이 없어 생산 기록을 사용할 수 없습니다.
      </div>
    )
  }

  const staffResult = await getWorkingStaffForRawStock()
  if ("error" in staffResult) {
    return <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{staffResult.error}</div>
  }

  const actorId = await getProdLogActor()
  if (!actorId) {
    return (
      <RawStockAuthGate
        targetLabel="생산 기록"
        targetPartCode="KP"
        staff={staffResult.staff}
        onVerify={verifyProdLogPin}
      />
    )
  }

  const actor = staffResult.staff.find((s) => s.id === actorId)
  // 인증한 직원이 그 사이 퇴근 처리됐으면(근무중 목록에서 빠짐) 다시 인증하게 한다.
  if (!actor) {
    return (
      <RawStockAuthGate
        targetLabel="생산 기록"
        targetPartCode="KP"
        staff={staffResult.staff}
        onVerify={verifyProdLogPin}
      />
    )
  }

  const [items, categories] = await Promise.all([getProdLogItems(), getRawCategoriesFull()])

  return <ProductionRecord staffName={actor.name} onDuty={staffResult.staff} items={items} categories={categories} />
}
