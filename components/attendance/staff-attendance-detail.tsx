"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  updateAttendanceDay,
  deleteAttendanceDay,
  type AttendanceDayRow,
  type AttendanceBreakInput,
} from "@/app/actions/attendance"
import { isoToKstTime, todayKst } from "@/lib/date-kst"
import { Button } from "@/components/ui/button"
import { SimpleTrendChart } from "@/components/simple-trend-chart"

/** "YYYY-MM"의 마지막 날짜(일)를 반환 */
function daysInMonth(monthStr: string): number {
  const [y, m] = monthStr.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "-"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}

function formatTime(iso: string | null): string {
  return iso ? isoToKstTime(iso) : "-"
}

type EditTarget = {
  date: string
  checkIn: string
  checkOut: string
  breaks: { start: string; end: string }[]
}

export function StaffAttendanceDetail({
  staffId,
  staffName,
  month,
  days,
}: {
  staffId: string
  staffName: string
  month: string
  days: AttendanceDayRow[]
}) {
  const router = useRouter()
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [addDate, setAddDate] = useState<string>(todayKst().slice(0, 7) === month ? todayKst() : `${month}-01`)
  const [deletingDate, setDeletingDate] = useState<string | null>(null)
  const [deletePending, startDeleteTransition] = useTransition()

  const openEdit = (row: AttendanceDayRow) => {
    setEditTarget({
      date: row.date,
      checkIn: formatTime(row.checkIn) === "-" ? "" : formatTime(row.checkIn),
      checkOut: formatTime(row.checkOut) === "-" ? "" : formatTime(row.checkOut),
      breaks: row.breakPeriods.map((bp) => ({
        start: formatTime(bp.start) === "-" ? "" : formatTime(bp.start),
        end: bp.end ? formatTime(bp.end) : "",
      })),
    })
  }

  const openAdd = () => {
    if (!addDate) return
    setEditTarget({ date: addDate, checkIn: "", checkOut: "", breaks: [] })
  }

  const confirmDelete = (date: string) => {
    startDeleteTransition(async () => {
      const result = await deleteAttendanceDay(staffId, date)
      setDeletingDate(null)
      if (!("error" in result)) router.refresh()
    })
  }

  // 근무시간 추이 그래프 — 기록 없는 날짜도 0시간으로 채워 그 달 전체 흐름을 보여준다.
  const chartData = useMemo(() => {
    const workMinutesByDate = new Map(days.map((d) => [d.date, d.workMinutes]))
    const isCurrentMonth = todayKst().slice(0, 7) === month
    const lastDay = isCurrentMonth ? Number(todayKst().slice(8, 10)) : daysInMonth(month)
    const monthNum = Number(month.slice(5, 7))

    return Array.from({ length: lastDay }, (_, i) => {
      const day = i + 1
      const date = `${month}-${String(day).padStart(2, "0")}`
      const minutes = workMinutesByDate.get(date) ?? 0
      return { label: `${monthNum}/${day}`, value: Math.round((minutes / 60) * 10) / 10 }
    })
  }, [days, month])

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">일별 근무시간 추이</h2>
        <div className="rounded-lg border border-border bg-card p-4">
          <SimpleTrendChart data={chartData} valueSuffix="시간" ariaLabel={`${staffName}님의 ${month} 일별 근무시간 추이 그래프`} />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">일별 기록</h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={addDate}
            min={`${month}-01`}
            max={todayKst()}
            onChange={(e) => setAddDate(e.target.value)}
            className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
          />
          <Button size="sm" variant="outline" onClick={openAdd} disabled={!addDate}>
            기록 추가
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">날짜</th>
              <th className="px-4 py-2 font-medium">출근</th>
              <th className="px-4 py-2 font-medium">퇴근</th>
              <th className="px-4 py-2 font-medium">근무시간</th>
              <th className="px-4 py-2 font-medium">휴게시간</th>
              <th className="px-4 py-2 font-medium text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {days.map((row) => (
              <tr key={row.date} className="border-t border-border">
                <td className="px-4 py-2.5">{row.date}</td>
                <td className="px-4 py-2.5">{formatTime(row.checkIn)}</td>
                <td className="px-4 py-2.5">
                  {row.stillWorking || row.stillOnBreak ? (
                    <span className="text-amber-600">미퇴근</span>
                  ) : (
                    formatTime(row.checkOut)
                  )}
                </td>
                <td className="px-4 py-2.5">{formatMinutes(row.workMinutes)}</td>
                <td className="px-4 py-2.5">{formatMinutes(row.breakMinutes)}</td>
                <td className="px-4 py-2.5 text-right">
                  {deletingDate === row.date ? (
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-muted-foreground">삭제할까요?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={deletePending}
                        onClick={() => confirmDelete(row.date)}
                      >
                        삭제
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={deletePending}
                        onClick={() => setDeletingDate(null)}
                      >
                        취소
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                        수정
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeletingDate(row.date)}>
                        삭제
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {days.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  {month}에 {staffName}님의 출퇴근 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editTarget && (
        <EditAttendanceDialog
          staffId={staffId}
          staffName={staffName}
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function EditAttendanceDialog({
  staffId,
  staffName,
  target,
  onClose,
  onSaved,
}: {
  staffId: string
  staffName: string
  target: EditTarget
  onClose: () => void
  onSaved: () => void
}) {
  const [checkIn, setCheckIn] = useState(target.checkIn)
  const [checkOut, setCheckOut] = useState(target.checkOut)
  const [breaks, setBreaks] = useState(target.breaks)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const addBreak = () => setBreaks((prev) => [...prev, { start: "", end: "" }])
  const removeBreak = (i: number) => setBreaks((prev) => prev.filter((_, idx) => idx !== i))
  const updateBreak = (i: number, field: "start" | "end", value: string) =>
    setBreaks((prev) => prev.map((b, idx) => (idx === i ? { ...b, [field]: value } : b)))

  const save = () => {
    setError(null)
    const cleanedBreaks: AttendanceBreakInput[] = breaks
      .filter((b) => b.start)
      .map((b) => ({ start: b.start, end: b.end || null }))

    startTransition(async () => {
      const result = await updateAttendanceDay(staffId, target.date, {
        checkIn: checkIn || null,
        checkOut: checkOut || null,
        breaks: cleanedBreaks,
      })
      if ("error" in result) {
        setError(result.error)
        return
      }
      onSaved()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-background p-6 shadow-xl">
        <div>
          <h2 className="text-lg font-semibold">
            {staffName}님 · {target.date}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            해당 날짜의 출근/휴게/퇴근 기록을 통째로 다시 저장합니다. 비워두면 해당 이벤트가 없던 것으로 처리됩니다.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="w-16 shrink-0 text-sm text-muted-foreground">출근</label>
            <input
              type="time"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted-foreground">휴게</label>
              <button type="button" onClick={addBreak} className="text-xs font-medium text-emerald-600 hover:underline">
                + 휴게 추가
              </button>
            </div>
            {breaks.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  value={b.start}
                  onChange={(e) => updateBreak(i, "start", e.target.value)}
                  className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                />
                <span className="text-sm text-muted-foreground">~</span>
                <input
                  type="time"
                  value={b.end}
                  onChange={(e) => updateBreak(i, "end", e.target.value)}
                  className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeBreak(i)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  삭제
                </button>
              </div>
            ))}
            {breaks.length === 0 && <p className="text-xs text-muted-foreground">등록된 휴게 없음</p>}
          </div>

          <div className="flex items-center gap-3">
            <label className="w-16 shrink-0 text-sm text-muted-foreground">퇴근</label>
            <input
              type="time"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button onClick={save} disabled={pending}>
            저장
          </Button>
        </div>
      </div>
    </div>
  )
}
