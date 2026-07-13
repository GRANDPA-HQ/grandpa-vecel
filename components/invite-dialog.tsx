"use client"

import { useActionState, useEffect, useRef } from "react"
import { inviteEmployee } from "@/app/actions/invitations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"

export function InviteDialog({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(inviteEmployee, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    // 성공 시 입력만 비우고, 생성된 계정 정보를 전달할 수 있도록 자동으로 닫지 않는다
    if (state?.success) formRef.current?.reset()
  }, [state?.success])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 다이얼로그 */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">직원 추가</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          이메일을 입력하면 계정이 바로 생성됩니다.
          <br />
          아이디는 <b>입력한 이메일</b>, 초기 비밀번호는 <b>1111</b> 입니다.
          생성 후 직원에게 직접 알려주세요.
        </p>

        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">이메일</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              placeholder="employee@company.com"
              required
              autoFocus
            />
          </div>

          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          {state?.success && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
              <p className="font-medium">계정이 생성되었습니다. 직원에게 전달해주세요:</p>
              <p className="mt-1 font-mono text-xs">
                아이디: {state.email}
                <br />
                비밀번호: 1111
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {state?.success ? "닫기" : "취소"}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "생성 중..." : "계정 생성"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
