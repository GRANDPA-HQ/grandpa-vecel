"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { ackNotice, type NoticeSummary } from "@/app/actions/notices"
import type { KioskStaff } from "@/app/actions/attendance"
import { StaffGrid } from "@/components/attendance/staff-grid"
import { PinPad } from "@/components/attendance/pin-pad"
import { ConfirmScreen } from "@/components/attendance/confirm-screen"

type Step =
  | { kind: "detail" }
  | { kind: "select-staff" }
  | { kind: "pin"; staffId: string }
  | { kind: "confirm"; staffName: string }

export function NoticeDetailDialog({
  notice,
  staff,
  positionLabel,
  onClose,
  onAcked,
}: {
  notice: NoticeSummary
  staff: KioskStaff[]
  positionLabel: string
  onClose: () => void
  onAcked: () => void
}) {
  const [step, setStep] = useState<Step>({ kind: "detail" })
  const [error, setError] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState(false)

  // 대상 직책이 지정된 공지는 그 직책 직원만 본인 확인 대상으로 노출한다.
  const eligibleStaff = notice.targetPositionId
    ? staff.filter((s) => s.positionId === notice.targetPositionId)
    : staff

  const submitPin = async (staffId: string, pin: string) => {
    setPending(true)
    setError(undefined)
    const result = await ackNotice(staffId, notice.id, pin)
    setPending(false)
    if ("error" in result) {
      setError(result.error)
      return
    }
    const staffName = staff.find((s) => s.id === staffId)?.name ?? ""
    onAcked()
    setStep({ kind: "confirm", staffName })
  }

  const allAcked = notice.totalStaff > 0 && notice.ackCount >= notice.totalStaff

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col rounded-xl border border-border bg-background p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {step.kind === "detail" && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="pr-6 text-lg font-semibold">{notice.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(notice.createdAt).toLocaleString("ko-KR")} · 대상: {positionLabel} · 확인 {notice.ackCount}/
                {notice.totalStaff}
              </p>
            </div>
            {notice.body ? (
              <p className="whitespace-pre-wrap text-sm text-foreground">{notice.body}</p>
            ) : (
              <p className="text-sm text-muted-foreground">내용이 없습니다.</p>
            )}
            {allAcked ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
                전 직원이 확인을 완료했습니다.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setStep({ kind: "select-staff" })}
                className="rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground active:opacity-80"
              >
                공지 확인
              </button>
            )}
          </div>
        )}

        {step.kind === "select-staff" && (
          <div className="flex flex-col gap-4">
            <p className="text-center text-sm font-semibold text-muted-foreground">
              &ldquo;{notice.title}&rdquo; 확인 — 본인을 선택하세요
            </p>
            <StaffGrid staff={eligibleStaff} showStatusBadge={false} onSelect={(staffId) => setStep({ kind: "pin", staffId })} />
          </div>
        )}

        {step.kind === "pin" && (
          <div className="flex justify-center py-4">
            <PinPad
              headerText="공지 확인 · 본인 확인"
              subText={staff.find((s) => s.id === step.staffId)?.name ? `${staff.find((s) => s.id === step.staffId)?.name}님` : undefined}
              onSubmit={(pin) => submitPin(step.staffId, pin)}
              onCancel={() => setStep({ kind: "select-staff" })}
              error={error}
              pending={pending}
            />
          </div>
        )}

        {step.kind === "confirm" && (
          <ConfirmScreen
            message="공지를 확인했습니다"
            subMessage={`${step.staffName}님 · ${notice.title}`}
            onDone={onClose}
          />
        )}
      </div>
    </div>
  )
}
