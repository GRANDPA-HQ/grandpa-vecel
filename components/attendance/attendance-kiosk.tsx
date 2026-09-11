"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { checkAttendance, type KioskStaff } from "@/app/actions/attendance"
import { getActiveNotices, type ActiveNotice } from "@/app/actions/notices"
import {
  ACTION_ALLOWED,
  ACTION_LABEL,
  PIN_PROMPT,
  STATUS_LABEL,
  type CheckType,
} from "@/lib/attendance-status"
import { isoToKstTime, nowKstTime } from "@/lib/date-kst"
import { StaffGrid } from "@/components/attendance/staff-grid"
import { PinPad } from "@/components/attendance/pin-pad"
import { ConfirmScreen } from "@/components/attendance/confirm-screen"
import { NoticeWidget } from "@/components/attendance/notice-widget"
import { NoticeDetailDialog } from "@/components/attendance/notice-detail-dialog"
import type { PositionOption } from "@/components/attendance/notice-board"

const IDLE_TIMEOUT_MS = 15000

type Screen =
  | { kind: "grid" }
  | { kind: "action-select"; staffId: string }
  | { kind: "pin-attendance"; staffId: string; checkType: CheckType }
  | { kind: "confirm-attendance"; message: string; subMessage: string }

export function AttendanceKiosk({
  initialStaff,
  initialNotices,
  positionOptions,
}: {
  initialStaff: KioskStaff[]
  initialNotices: ActiveNotice[]
  positionOptions: PositionOption[]
}) {
  const [staff, setStaff] = useState<KioskStaff[]>(initialStaff)
  const [notices, setNotices] = useState<ActiveNotice[]>(initialNotices)
  // 공지 상세 — "전체 공지함"(NoticeBoard)과 동일하게 NoticeDetailDialog를 그대로 재사용해
  // 제목 클릭 → 본문 확인 → "공지 확인" → 본인선택 → PIN 순서로 통일한다.
  // notices(진행중 목록)에서 매번 찾아 쓰지 않고 별도 상태로 들고 있는 이유: PIN 확인 성공 직후
  // refreshActiveNotices()로 목록을 다시 받아오면 방금 확인한 공지가 목록에서 바로 빠질 수 있는데,
  // 그때 목록에서 찾는 방식이면 완료 화면을 보여주기도 전에 다이얼로그가 사라져버린다.
  const [openNotice, setOpenNotice] = useState<ActiveNotice | null>(null)
  const [screen, setScreen] = useState<Screen>({ kind: "grid" })
  const [pinError, setPinError] = useState<string | undefined>(undefined)
  const [pinPending, setPinPending] = useState(false)

  const [clock, setClock] = useState<string>(() => nowKstTime())
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 액션 선택 화면의 "현재 시각" 표시용 — 30초마다 갱신
  useEffect(() => {
    const interval = setInterval(() => setClock(nowKstTime()), 30000)
    return () => clearInterval(interval)
  }, [])

  const resetToGrid = useCallback(() => {
    setScreen({ kind: "grid" })
    setPinError(undefined)
    setPinPending(false)
  }, [])

  const bumpIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(resetToGrid, IDLE_TIMEOUT_MS)
  }, [resetToGrid])

  // 확인 화면(자체 3초 타이머 보유)과 초기 목록 화면이 아닌 모든 화면에서 15초 무입력 타이머를 돌린다.
  // 공지 다이얼로그(openNotice)는 "전체 공지함"과 동일하게 이 타이머 대상이 아니다.
  useEffect(() => {
    if (screen.kind === "grid" || screen.kind === "confirm-attendance") {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      return
    }
    bumpIdleTimer()
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [screen, bumpIdleTimer])

  const applyServerStatus = useCallback(
    (staffId: string, checkType: CheckType, checkedInAt: string | null, onBreakSinceAt: string | null) => {
      setStaff((prev) =>
        prev.map((s) => {
          if (s.id !== staffId) return s
          const status = checkType === "IN" || checkType === "BREAK_END" ? "WORKING" : checkType === "BREAK_START" ? "ON_BREAK" : "DONE"
          const breakCount = checkType === "BREAK_START" ? s.breakCount + 1 : s.breakCount
          return { ...s, status, breakCount, checkedInAt, onBreakSinceAt }
        }),
      )
    },
    [],
  )

  const selectStaffForAction = (staffId: string) => {
    bumpIdleTimer()
    setScreen({ kind: "action-select", staffId })
  }

  const chooseAction = (staffId: string, checkType: CheckType) => {
    bumpIdleTimer()
    setPinError(undefined)
    setScreen({ kind: "pin-attendance", staffId, checkType })
  }

  const submitAttendancePin = async (staffId: string, checkType: CheckType, pin: string) => {
    setPinPending(true)
    setPinError(undefined)
    const result = await checkAttendance(staffId, checkType, pin)
    setPinPending(false)
    if ("error" in result) {
      setPinError(result.error)
      return
    }
    applyServerStatus(staffId, checkType, result.checkedInAt, result.onBreakSinceAt)
    setScreen({
      kind: "confirm-attendance",
      message: `${result.message}`,
      subMessage: `${result.staffName}님`,
    })
  }

  const selectNotice = (noticeId: string) => {
    bumpIdleTimer()
    const notice = notices.find((n) => n.id === noticeId)
    if (!notice) return
    setOpenNotice(notice)
  }

  const refreshActiveNotices = useCallback(async () => {
    const result = await getActiveNotices()
    if ("notices" in result) setNotices(result.notices)
  }, [])

  const positionLabel = (id: string | null) =>
    id ? (positionOptions.find((p) => p.value === id)?.label ?? "알 수 없음") : "전체"

  return (
    <div onClick={bumpIdleTimer} className="mx-auto flex w-full max-w-2xl flex-col py-4">
      {screen.kind === "grid" && (
        <>
          <NoticeWidget notices={notices} onSelectNotice={selectNotice} />
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">근무자를 선택하세요</h2>
          <StaffGrid staff={staff} showStatusBadge onSelect={selectStaffForAction} />
        </>
      )}

      {screen.kind === "action-select" && (() => {
        const s = staff.find((x) => x.id === screen.staffId)
        if (!s) return null
        const actions = ACTION_ALLOWED[s.status]
        const statusDetail =
          s.status === "WORKING" && s.checkedInAt
            ? ` (${isoToKstTime(s.checkedInAt)} 출근)`
            : s.status === "ON_BREAK" && s.onBreakSinceAt
              ? ` (${isoToKstTime(s.onBreakSinceAt)}부터)`
              : ""
        return (
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="w-full max-w-xs rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-base font-semibold">{s.name}님</p>
              <p className="mt-1 text-xs text-muted-foreground">
                현재 상태: {STATUS_LABEL[s.status]}
                {statusDetail}
                {s.breakCount > 0 && ` · 오늘 휴게 ${s.breakCount}회`}
              </p>
            </div>
            <p className="text-2xl font-bold tracking-tight">{clock}</p>
            <div className="flex w-full max-w-xs flex-col gap-3">
              {actions.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">오늘 처리할 수 있는 동작이 없습니다.</p>
              )}
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => chooseAction(s.id, action)}
                  className="rounded-xl bg-primary py-4 text-base font-bold text-primary-foreground active:opacity-80"
                >
                  {ACTION_LABEL[action]}
                </button>
              ))}
              <button
                type="button"
                onClick={resetToGrid}
                className="rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground"
              >
                취소
              </button>
            </div>
          </div>
        )
      })()}

      {screen.kind === "pin-attendance" && (
        <div className="flex justify-center py-8">
          <PinPad
            key={`${screen.staffId}-${screen.checkType}`}
            headerText={PIN_PROMPT[screen.checkType]}
            subText={staff.find((s) => s.id === screen.staffId)?.name ? `${staff.find((s) => s.id === screen.staffId)?.name}님` : undefined}
            onSubmit={(pin) => submitAttendancePin(screen.staffId, screen.checkType, pin)}
            onCancel={resetToGrid}
            error={pinError}
            pending={pinPending}
            onInteract={bumpIdleTimer}
          />
        </div>
      )}

      {screen.kind === "confirm-attendance" && (
        <ConfirmScreen message={screen.message} subMessage={screen.subMessage} onDone={resetToGrid} />
      )}

      {openNotice && (
        <NoticeDetailDialog
          notice={openNotice}
          staff={staff}
          positionLabel={positionLabel(openNotice.targetPositionId)}
          onClose={() => setOpenNotice(null)}
          onAcked={refreshActiveNotices}
        />
      )}
    </div>
  )
}
