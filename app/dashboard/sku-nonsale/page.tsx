import { redirect } from "next/navigation"
import { getCurrentEmployee } from "@/lib/permissions"
import { getNonsaleActor } from "@/lib/nonsale-session"
import { getWorkingStaffForRawStock } from "@/app/actions/raw-stock-auth"
import { verifyNonsaleLogPin } from "@/app/actions/nonsale-auth"
import { getSkuNonsaleItems, getSkuCategories, getMyTodayNonsaleLogs } from "@/lib/supabase/db"
import { RawStockAuthGate } from "@/components/stock/raw-stock-auth-gate"
import { NonsaleLog } from "@/components/nonsale/nonsale-log"

export default async function SkuNonsalePage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  if (!employee.storeId) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        소속 매장이 없어 판매 외 소진을 사용할 수 없습니다.
      </div>
    )
  }

  const staffResult = await getWorkingStaffForRawStock()
  if ("error" in staffResult) {
    return <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{staffResult.error}</div>
  }

  let actorId: string
  let actorName: string

  if (employee.isSenior) {
    // 매니저(시니어) 이상은 본인 확인 PIN 없이 통과
    actorId = employee.id
    actorName = employee.name
  } else {
    const sessionActorId = await getNonsaleActor()
    if (!sessionActorId) {
      return (
        <RawStockAuthGate
          targetLabel="판매 외 소진"
          targetPartCode="SP"
          staff={staffResult.staff}
          onVerify={verifyNonsaleLogPin}
        />
      )
    }

    const actor = staffResult.staff.find((s) => s.id === sessionActorId)
    // 인증한 직원이 그 사이 퇴근 처리됐으면(근무중 목록에서 빠짐) 다시 인증하게 한다.
    if (!actor) {
      return (
        <RawStockAuthGate
          targetLabel="판매 외 소진"
          targetPartCode="SP"
          staff={staffResult.staff}
          onVerify={verifyNonsaleLogPin}
        />
      )
    }
    actorId = actor.id
    actorName = actor.name
  }

  const [items, categoriesRaw, myLogs] = await Promise.all([
    getSkuNonsaleItems(),
    getSkuCategories(),
    getMyTodayNonsaleLogs(employee.storeId, actorId),
  ])
  const categories = categoriesRaw.map((c) => ({ code: c.category_code, name: c.category_name_kr, emoji: c.emoji ?? "▤" }))

  return <NonsaleLog staffName={actorName} storeName={employee.storeName} items={items} categories={categories} myLogs={myLogs} />
}
