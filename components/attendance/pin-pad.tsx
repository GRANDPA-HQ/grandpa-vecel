"use client"

import { useCallback, useEffect, useState } from "react"
import { cn } from "@/lib/utils"

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "func:cancel", "0", "func:back"] as const

export function PinPad({
  headerText,
  subText,
  onSubmit,
  onCancel,
  error,
  pending,
  onInteract,
}: {
  headerText: string
  subText?: string
  onSubmit: (pin: string) => void
  onCancel: () => void
  error?: string
  pending?: boolean
  // 어떤 탭이든 발생하면 상위의 15초 무입력 타이머를 리셋하기 위해 호출
  onInteract?: () => void
}) {
  const [digits, setDigits] = useState<string>("")

  // 새 시도(에러 후 다시 입력 등)마다 4자리가 채워지면 자동 제출
  useEffect(() => {
    if (digits.length === 4 && !pending) {
      onSubmit(digits)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits])

  const press = useCallback(
    (key: (typeof KEYS)[number]) => {
      onInteract?.()
      if (pending) return
      if (key === "func:cancel") {
        onCancel()
        return
      }
      if (key === "func:back") {
        setDigits((d) => d.slice(0, -1))
        return
      }
      setDigits((d) => (d.length >= 4 ? d : d + key))
    },
    [onCancel, onInteract, pending],
  )

  // PIN 오류 응답을 받으면 입력을 비워 재시도할 수 있게 한다 (무제한 재시도, 확정)
  useEffect(() => {
    if (error) setDigits("")
  }, [error])

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-lg font-semibold">{headerText}</p>
        {subText && <p className="mt-1 text-sm text-muted-foreground">{subText}</p>}
      </div>

      <div className="flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-4 w-4 rounded-full border-2 border-primary",
              i < digits.length && "bg-primary",
            )}
          />
        ))}
      </div>

      {error && (
        <p className="-mt-2 text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid w-full grid-cols-3 gap-3">
        {KEYS.map((key) => {
          const isFunc = key.startsWith("func:")
          const label = key === "func:cancel" ? "취소" : key === "func:back" ? "지움" : key
          return (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              disabled={pending}
              className={cn(
                "flex h-16 items-center justify-center rounded-xl border border-border bg-card text-xl font-semibold transition-colors active:bg-muted disabled:opacity-50",
                isFunc && "text-sm font-bold text-muted-foreground",
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
