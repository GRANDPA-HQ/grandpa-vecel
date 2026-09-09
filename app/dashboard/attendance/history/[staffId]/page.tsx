import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentEmployee } from "@/lib/permissions"
import { getStaffAttendanceMonth } from "@/app/actions/attendance"
import { addMonthsKst, currentMonthKst, isValidMonthStr } from "@/lib/date-kst"
import { StaffAttendanceDetail } from "@/components/attendance/staff-attendance-detail"

export default async function StaffAttendanceHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  if (!employee.isSenior) redirect("/dashboard/bug-report")

  const { staffId } = await params
  const { month: monthParam } = await searchParams
  const month = isValidMonthStr(monthParam) ? monthParam : currentMonthKst()
  const prevMonth = addMonthsKst(`${month}-01`, -1).slice(0, 7)
  const nextMonth = addMonthsKst(`${month}-01`, 1).slice(0, 7)

  const result = await getStaffAttendanceMonth(staffId, month)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/attendance/history"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 근태관리로 돌아가기
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {"error" in result ? "일별 근태 기록" : `${result.staffName}님의 일별 근태 기록`}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Link
          href={`?month=${prevMonth}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ← 이전달
        </Link>
        <span className="text-sm font-medium">{month}</span>
        <Link
          href={`?month=${nextMonth}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          다음달 →
        </Link>
      </div>

      {"error" in result ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {result.error}
        </div>
      ) : (
        <StaffAttendanceDetail staffId={staffId} staffName={result.staffName} month={month} days={result.days} />
      )}
    </div>
  )
}
