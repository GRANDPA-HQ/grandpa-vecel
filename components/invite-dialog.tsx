"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { inviteEmployee } from "@/app/actions/invitations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"

export function InviteDialog({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(inviteEmployee, undefined)
  const formRef = useRef<HTMLFormElement>(null)
  // 주방 등 이메일이 없는 직원은 로그인 계정 없이 이름+파트만으로 등록할 수 있게 함
  const [noEmail, setNoEmail] = useState(false)

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
          {noEmail
            ? "이메일 없이 등록하면 대시보드 로그인 계정은 만들어지지 않고, 이름/파트만으로 직원 정보만 등록됩니다. 등록 후 'PIN 발급 관리'에서 출퇴근 PIN을 발급해주세요."
            : "이메일을 입력하면 계정이 바로 생성되고, 아이디/무작위로 생성된 초기 비밀번호 안내 메일이 해당 주소로 자동 발송됩니다."}
        </p>

        <label className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={noEmail}
            onChange={(e) => setNoEmail(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          이메일이 없는 직원이에요 (주방 등 — 로그인 계정 없이 등록)
        </label>

        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="noEmail" value={noEmail ? "1" : "0"} />

          {noEmail ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-name">이름</Label>
                <Input id="invite-name" name="name" placeholder="홍길동" required autoFocus />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-part">파트</Label>
                <select
                  id="invite-part"
                  name="partCode"
                  required
                  defaultValue="KP"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="SP">서비스(SP)</option>
                  <option value="KP">키친(KP)</option>
                </select>
              </div>
            </>
          ) : (
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
          )}

          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          {state?.success && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
              {state.noEmail ? (
                <p className="font-medium">{state.name}님이 로그인 계정 없이 등록되었습니다.</p>
              ) : (
                <>
                  <p className="font-medium">
                    {state.emailWarning ? "계정이 생성되었습니다." : "계정이 생성되고 안내 메일이 발송되었습니다."}
                  </p>
                  <p className="mt-1 font-mono text-xs">
                    아이디: {state.email}
                    <br />
                    비밀번호: {state.password}
                  </p>
                  {state.emailWarning && (
                    <p className="mt-2 text-xs text-amber-700">{state.emailWarning}</p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {state?.success ? "닫기" : "취소"}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "등록 중..." : noEmail ? "직원 등록" : "계정 생성"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
