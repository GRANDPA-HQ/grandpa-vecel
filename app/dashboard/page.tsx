import { redirect } from "next/navigation"
import { getCurrentEmployee } from "@/lib/permissions"
import { getKioskData } from "@/app/actions/attendance"
import { getActiveNotices } from "@/app/actions/notices"
import { AttendanceKiosk } from "@/components/attendance/attendance-kiosk"

export default async function DashboardPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")

  if (!employee.storeId) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        소속 매장이 없어 출퇴근 화면을 사용할 수 없습니다. 관리자에게 문의해 주세요.
      </div>
    )
  }

  const [kioskResult, noticesResult] = await Promise.all([getKioskData(), getActiveNotices()])

  if ("error" in kioskResult) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {kioskResult.error}
      </div>
    )
  }

  const notices = "error" in noticesResult ? [] : noticesResult.notices

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{employee.storeName} SP(서비스파트) HOME</h1>
        <p className="mt-1 text-sm text-muted-foreground">출퇴근(PIN 체크인) · SP 파트 공용 화면</p>
      </div>
      <AttendanceKiosk initialStaff={kioskResult.staff} initialNotices={notices} />
    </div>
  )
}
