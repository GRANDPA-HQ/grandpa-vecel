"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { changePassword } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { KeyRound, X } from "lucide-react"

export function ChangePasswordButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="비밀번호 변경"
        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200"
      >
        <KeyRound className="h-4 w-4" />
      </button>
      {open && <ChangePasswordDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(changePassword, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset()
      setTimeout(onClose, 1200)
    }
  }, [state?.success, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 다이얼로그 */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">비밀번호 변경</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw-current">현재 비밀번호</Label>
            <Input
              id="pw-current"
              name="current"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw-next">새 비밀번호</Label>
            <Input
              id="pw-next"
              name="next"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw-confirm">새 비밀번호 확인</Label>
            <Input
              id="pw-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          {state?.success && (
            <p className="text-sm text-green-600" role="status">
              비밀번호가 변경되었습니다.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "변경 중..." : "변경"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
