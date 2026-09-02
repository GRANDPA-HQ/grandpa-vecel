"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { checkAttendance, type KioskStaff } from "@/app/actions/attendance"
import { ackNotice, type ActiveNotice } from "@/app/actions/notices"
import {
  ACTION_ALLOWED,
  ACTION_LABEL,
  PIN_PROMPT,
  STATUS_LABEL,
  type CheckType,
} from "@/lib/attendance-status"
import { StaffGrid } from "@/components/attendance/staff-grid"
import { PinPad } from "@/components/attendance/pin-pad"
import { ConfirmScreen } from "@/components/attendance/confirm-screen"
import { NoticeWidget } from "@/components/attendance/notice-widget"

const IDLE_TIMEOUT_MS = 15000

type Screen =
  | { kind: "grid" }
  | { kind: "action-select"; staffId: string }
  | { kind: "pin-attendance"; staffId: string; checkType: CheckType }
  | { kind: "confirm-attendance"; message: string; subMessage: string }
  | { kind: "notice-select-staff"; noticeId: string; noticeTitle: string; targetPositionId: string | null }
  | { kind: "pin-notice"; staffId: string; noticeId: string; noticeTitle: string }
  | { kind: "confirm-notice"; message: string; subMessage: string }

export function AttendanceKiosk({
  initialStaff,
  initialNotices,
}: {
  initialStaff: KioskStaff[]
  initialNotices: ActiveNotice[]
}) {
  const [staff, setStaff] = useState<KioskStaff[]>(initialStaff)
  const [notices, setNotices] = useState<ActiveNotice[]>(initialNotices)
  const [screen, setScreen] = useState<Screen>({ kind: "grid" })
  const [pinError, setPinError] = useState<string | undefined>(undefined)
  const [pinPending, setPinPending] = useState(false)

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetToGrid = useCallback(() => {
    setScreen({ kind: "grid" })
    setPinError(undefined)
    setPinPending(false)
  }, [])

  const bumpIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(resetToGrid, IDLE_TIMEOUT_MS)
  }, [resetToGrid])

  // 확인 화면(자체 3초 타이머 보유)과 초기 목록 화면이 아닌 모든 화면에서 15초 무입력 타이머를 돌린다
  useEffect(() => {
    if (screen.kind === "grid" || screen.kind === "confirm-attendance" || screen.kind === "confirm-notice") {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      return
    }
    bumpIdleTimer()
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [screen, bumpIdleTimer])

  const applyOptimisticStatus = useCallback((staffId: string, checkType: CheckType) => {
    setStaff((prev) =>
      prev.map((s) => {
        if (s.id !== staffId) return s
        if (checkType === "IN") return { ...s, status: "WORKING" }
        if (checkType === "BREAK_START") return { ...s, status: "ON_BREAK", breakCount: s.breakCount + 1 }
        if (checkType === "BREAK_END") return { ...s, status: "WORKING" }
        return { ...s, status: "DONE" }
      }),
    )
  }, [])

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
    applyOptimisticStatus(staffId, checkType)
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
    setScreen({
      kind: "notice-select-staff",
      noticeId,
      noticeTitle: notice.title,
      targetPositionId: notice.targetPositionId,
    })
  }

  const selectStaffForNotice = (staffId: string) => {
    bumpIdleTimer()
    if (screen.kind !== "notice-select-staff") return
    setPinError(undefined)
    setScreen({ kind: "pin-notice", staffId, noticeId: screen.noticeId, noticeTitle: screen.noticeTitle })
  }

  const submitNoticePin = async (staffId: string, noticeId: string, noticeTitle: string, pin: string) => {
    setPinPending(true)
    setPinError(undefined)
    const result = await ackNotice(staffId, noticeId, pin)
    setPinPending(false)
    if ("error" in result) {
      setPinError(result.error)
      return
    }
    setNotices((prev) =>
      prev
        .map((n) => (n.id === noticeId ? { ...n, unread: Math.max(0, n.unread - 1) } : n))
        .filter((n) => n.unread > 0),
    )
    const staffName = staff.find((s) => s.id === staffId)?.name ?? ""
    setScreen({ kind: "confirm-notice", message: "공지를 확인했습니다", subMessage: `${staffName}님 · ${noticeTitle}` })
  }

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
        return (
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="w-full max-w-xs rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-base font-semibold">{s.name}님</p>
              <p className="mt-1 text-xs text-muted-foreground">
                현재 상태: {STATUS_LABEL[s.status]}
                {s.breakCount > 0 && ` · 오늘 휴게 ${s.breakCount}회`}
              </p>
            </div>
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

      {screen.kind === "notice-select-staff" && (
        <div className="flex flex-col py-4">
          <p className="mb-4 text-center text-sm font-semibold text-muted-foreground">
            &ldquo;{screen.noticeTitle}&rdquo; 확인 — 본인을 선택하세요
          </p>
          <StaffGrid
            staff={
              screen.targetPositionId ? staff.filter((s) => s.positionId === screen.targetPositionId) : staff
            }
            showStatusBadge={false}
            onSelect={selectStaffForNotice}
          />
          <button
            type="button"
            onClick={resetToGrid}
            className="mt-4 self-center rounded-xl border border-border px-6 py-2 text-sm font-medium text-muted-foreground"
          >
            취소
          </button>
        </div>
      )}

      {screen.kind === "pin-notice" && (
        <div className="flex justify-center py-8">
          <PinPad
            key={`notice-${screen.staffId}-${screen.noticeId}`}
            headerText="공지 확인 · 본인 확인"
            subText={staff.find((s) => s.id === screen.staffId)?.name ? `${staff.find((s) => s.id === screen.staffId)?.name}님` : undefined}
            onSubmit={(pin) => submitNoticePin(screen.staffId, screen.noticeId, screen.noticeTitle, pin)}
            onCancel={resetToGrid}
            error={pinError}
            pending={pinPending}
            onInteract={bumpIdleTimer}
          />
        </div>
      )}

      {screen.kind === "confirm-notice" && (
        <ConfirmScreen message={screen.message} subMessage={screen.subMessage} onDone={resetToGrid} />
      )}
    </div>
  )
}
