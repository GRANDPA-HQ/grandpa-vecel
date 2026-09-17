import Link from "next/link"
import { redirect } from "next/navigation"
import { FileSpreadsheet } from "lucide-react"
import { getCurrentEmployee } from "@/lib/permissions"
import { getAttendanceHistory } from "@/app/actions/attendance"
import { addMonthsKst, currentMonthKst, isValidMonthStr } from "@/lib/date-kst"
import { withBasePath } from "@/lib/base-path"
import { AttendanceHistoryTable } from "@/components/attendance/attendance-history-table"

export default async function AttendanceHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  // 매장 전체 직원의 근태를 한눈에 보는 화면은 매니저 이상만 접근 가능.
  // 일반 직원은 본인 근태만 볼 수 있으므로 본인 상세 페이지로 보낸다.
  if (!employee.isSenior) redirect(`/dashboard/attendance/history/${employee.id}`)

  const { month: monthParam } = await searchParams
  const month = isValidMonthStr(monthParam) ? monthParam : currentMonthKst()
  const prevMonth = addMonthsKst(`${month}-01`, -1).slice(0, 7)
  const nextMonth = addMonthsKst(`${month}-01`, 1).slice(0, 7)

  const result = await getAttendanceHistory(month)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">근태관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SP 파트 직원의 월별 근무 합계입니다. 직원을 클릭하면 그 달의 일별 출퇴근 기록을 볼 수 있습니다.
          </p>
        </div>
        <a
          href={withBasePath(`/api/export/attendance?month=${month}`)}
          title={`${month} 근태 기록을 엑셀로 저장`}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          엑셀 다운로드
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Link
          href={`?month=${prevMonth}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ← 이전달
        </Link>
        <form className="flex items-center gap-2" method="get">
          <input
            type="month"
            name="month"
            defaultValue={month}
            max={currentMonthKst()}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            조회
          </button>
        </form>
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
        <AttendanceHistoryTable month={month} totals={result.totals} />
      )}
    </div>
  )
}
