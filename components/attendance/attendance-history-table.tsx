"use client"

import { useRouter } from "next/navigation"
import type { AttendanceMonthlyTotal } from "@/app/actions/attendance"

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "-"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}

export function AttendanceHistoryTable({
  month,
  totals,
}: {
  month: string
  totals: AttendanceMonthlyTotal[]
}) {
  const router = useRouter()

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{month} 직원별 근무 합계</h2>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">이름</th>
              <th className="px-4 py-2 font-medium">근무일수</th>
              <th className="px-4 py-2 font-medium">총 근무시간</th>
              <th className="px-4 py-2 font-medium">총 휴게시간</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr
                key={t.staffId}
                onClick={() => router.push(`/dashboard/attendance/history/${t.staffId}?month=${month}`)}
                className="cursor-pointer border-t border-border hover:bg-muted/50"
              >
                <td className="px-4 py-2.5 font-medium text-foreground">{t.staffName}</td>
                <td className="px-4 py-2.5">{t.workDays}일</td>
                <td className="px-4 py-2.5">{formatMinutes(t.workMinutes)}</td>
                <td className="px-4 py-2.5">{formatMinutes(t.breakMinutes)}</td>
              </tr>
            ))}
            {totals.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  해당 매장에 SP 파트 직원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
