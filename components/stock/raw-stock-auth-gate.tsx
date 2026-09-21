"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PinPad } from "@/components/attendance/pin-pad"
import type { WorkingStaffOption } from "@/app/actions/raw-stock-auth"

// 재고관리 공통인증 — "직원선택→PIN" (재고관리_공통인증_직원선택PIN_v0.3.html 이식).
// targetLabel/targetPartCode/onVerify를 매개변수로 받아 포장부자재 등 다른 재고화면에도
// 재사용할 수 있게 작성했다(설계서: "재고관리 공통 인증 화면 — 원재료·포장부자재 등에서 공유").
export function RawStockAuthGate({
  targetLabel,
  targetPartCode,
  staff,
  onVerify,
}: {
  targetLabel: string
  targetPartCode: string
  staff: WorkingStaffOption[]
  onVerify: (staffId: string, pin: string) => Promise<{ error?: string; success?: boolean }>
}) {
  const router = useRouter()
  const [picked, setPicked] = useState<WorkingStaffOption | null>(null)
  const [error, setError] = useState<string | undefined>(undefined)
  const [pending, startTransition] = useTransition()

  // 정렬: 1차 대상 파트 우선, 2차 이름 가나다순
  const ordered = [...staff].sort((a, b) => {
    const pa = a.partCode === targetPartCode ? 0 : 1
    const pb = b.partCode === targetPartCode ? 0 : 1
    if (pa !== pb) return pa - pb
    return a.name.localeCompare(b.name, "ko")
  })

  function handleSubmit(pin: string) {
    if (!picked) return
    setError(undefined)
    startTransition(async () => {
      const result = await onVerify(picked.id, pin)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  if (picked) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-6 py-10">
        <PinPad
          key={picked.id}
          headerText="본인을 확인하세요"
          subText={`${picked.name} 님`}
          onSubmit={handleSubmit}
          onCancel={() => {
            setPicked(null)
            setError(undefined)
          }}
          error={error}
          pending={pending}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-1 py-6">
      <p className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">GRANDPA CORE</p>
      <h1 className="mt-1 text-center text-lg font-extrabold">{targetLabel}</h1>
      <p className="mt-6 text-center text-sm font-bold text-muted-foreground">본인을 선택하세요</p>
      <p className="mb-5 text-center text-xs font-semibold text-muted-foreground/80">근무 중인 직원만 표시됩니다</p>

      {ordered.length === 0 ? (
        <p className="py-10 text-center text-sm font-semibold text-muted-foreground">근무 중인 직원이 없습니다</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {ordered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setPicked(s)}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left shadow-sm transition-colors active:bg-muted"
            >
              <span className="text-lg font-extrabold tracking-tight">{s.name}</span>
              {s.partCode && <span className="text-sm font-semibold text-muted-foreground">· {s.partCode}</span>}
            </button>
          ))}
        </div>
      )}

      <p className="pb-2 pt-6 text-center text-[11px] font-medium text-muted-foreground">
        명단에 없으면 먼저 출근 확인을 해주세요
      </p>
    </div>
  )
}
