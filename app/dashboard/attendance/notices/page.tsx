import { redirect } from "next/navigation"
import { getCurrentEmployee } from "@/lib/permissions"
import { listNotices } from "@/app/actions/notices"
import { getKioskData } from "@/app/actions/attendance"
import { getIdLabelOptions } from "@/lib/supabase/db"
import { EMPLOYEE_FK_LOOKUPS, sortOptionsByLabelOrder } from "@/lib/table-config"
import { NoticeBoard } from "@/components/attendance/notice-board"

const POSITION_LOOKUP = EMPLOYEE_FK_LOOKUPS.find((l) => l.column === "position_id")!
const STORE_LOOKUP = EMPLOYEE_FK_LOOKUPS.find((l) => l.column === "store_id")!

export default async function AttendanceNoticesPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")

  if (!employee.storeId) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        소속 매장이 없어 공지 게시판을 사용할 수 없습니다. 관리자에게 문의해 주세요.
      </div>
    )
  }

  const [noticesResult, staffResult, positionOptionsRaw, storeOptions] = await Promise.all([
    listNotices(),
    getKioskData(),
    getIdLabelOptions(POSITION_LOOKUP.table, POSITION_LOOKUP.labelColumn).catch(() => []),
    getIdLabelOptions(STORE_LOOKUP.table, STORE_LOOKUP.labelColumn).catch(() => []),
  ])

  const positionOptions = sortOptionsByLabelOrder(positionOptionsRaw, POSITION_LOOKUP.labelOrder)
  const error = "error" in noticesResult ? noticesResult.error : "error" in staffResult ? staffResult.error : null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">공지 게시판</h1>
        <p className="mt-1 text-sm text-muted-foreground">{employee.storeName} · SP 파트 직원 현황 및 공지</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <NoticeBoard
          initialNotices={"notices" in noticesResult ? noticesResult.notices : []}
          staff={"staff" in staffResult ? staffResult.staff : []}
          positionOptions={positionOptions}
          storeOptions={storeOptions}
          defaultStoreId={employee.storeId}
          canCreate={employee.isSenior}
        />
      )}
    </div>
  )
}
