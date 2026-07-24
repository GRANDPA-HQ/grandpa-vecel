"use client"

import { useActionState, useState } from "react"
import { signIn, register } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft } from "lucide-react"

/* ── 로그인 (네이버 스타일) ─────────────────────────── */
function SignInForm({ onSwitch }: { onSwitch: () => void }) {
  const [state, formAction, pending] = useActionState(signIn, undefined)

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-[#f5f6f8] px-4 py-12">
      {/* 로고 */}
      <div className="mb-8 flex flex-col items-center gap-1">
        <span className="text-4xl font-extrabold tracking-tight text-red-600">Granpa-co</span>
        <span className="text-sm text-gray-500">스마트 생산 관리 시스템</span>
      </div>

      {/* 카드 */}
      <div className="w-full max-w-[400px] rounded-xl border border-gray-200 bg-white px-8 py-9 shadow-sm">
        <h2 className="mb-6 text-center text-lg font-bold text-gray-800">로그인</h2>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-sm font-medium text-gray-700">
              이메일
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="이메일 주소를 입력하세요"
              required
              className="h-11 border-gray-300 bg-gray-50 focus:bg-white"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-sm font-medium text-gray-700">
              비밀번호
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호를 입력하세요"
              required
              className="h-11 border-gray-300 bg-gray-50 focus:bg-white"
            />
          </div>

          {state?.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
              {state.error}
            </p>
          )}

          <Button
            type="submit"
            disabled={pending}
            className="mt-1 h-11 w-full bg-red-600 text-base font-semibold hover:bg-red-700"
          >
            {pending ? "로그인 중..." : "로그인"}
          </Button>
        </form>

        <div className="mt-6 border-t border-gray-100 pt-5 text-center text-sm text-gray-500">
          계정이 없으신가요?{" "}
          <button
            type="button"
            onClick={onSwitch}
            className="font-semibold text-red-600 hover:underline"
          >
            회원가입
          </button>
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        © 2025 Granpa-co. All rights reserved.
      </p>
    </main>
  )
}

/* ── 회원가입 (스플릿 레이아웃) ──────────────────────── */
function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const [state, formAction, pending] = useActionState(register, undefined)

  return (
    <main className="flex min-h-svh">
      {/* 왼쪽 브랜드 패널 */}
      <div className="hidden flex-col items-center justify-center gap-6 bg-gray-900 px-12 lg:flex lg:w-[45%]">
        <div className="text-center">
          <span className="text-5xl font-extrabold tracking-tight text-red-400">
            Granpa-co
          </span>
          <p className="mt-3 text-gray-400">스마트 생산 관리 시스템</p>
        </div>
        <ul className="mt-6 flex flex-col gap-3 text-sm text-gray-500">
          {["직원 관리 및 권한 제어", "생산 공정 모니터링", "레시피 가이드 문서 관리", "실시간 데이터 테이블 조회"].map(
            (item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {item}
              </li>
            ),
          )}
        </ul>
      </div>

      {/* 오른쪽 폼 패널 */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-8 py-12">
        <div className="w-full max-w-sm">
          {/* 모바일용 로고 */}
          <div className="mb-8 text-center lg:hidden">
            <span className="text-3xl font-extrabold text-red-600">Granpa-co</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900">회원가입</h2>
          <p className="mt-1.5 text-sm text-gray-500">
            초대받은 이메일로 계정을 만들어주세요
          </p>

          <form action={formAction} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-email" className="text-sm font-medium text-gray-700">
                이메일
              </Label>
              <Input
                id="reg-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="초대받은 이메일 주소"
                required
                className="h-11"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-password" className="text-sm font-medium text-gray-700">
                비밀번호
              </Label>
              <Input
                id="reg-password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="6자 이상 입력하세요"
                required
                className="h-11"
              />
            </div>

            {state?.error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
                {state.error}
              </p>
            )}

            <Button
              type="submit"
              disabled={pending}
              className="mt-1 h-11 w-full bg-gray-900 text-base font-semibold hover:bg-gray-800"
            >
              {pending ? "처리 중..." : "가입하기"}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-1 text-sm text-gray-500">
            <ArrowLeft className="h-3.5 w-3.5" />
            <button
              type="button"
              onClick={onSwitch}
              className="font-medium text-gray-700 hover:underline"
            >
              로그인으로 돌아가기
            </button>
          </div>

          <p className="mt-8 text-center text-xs text-gray-400">
            초대를 받지 못하셨나요? 관리자에게 문의하세요.
          </p>
        </div>
      </div>
    </main>
  )
}

/* ── 진입점 ─────────────────────────────────────────── */
export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "register">("signin")

  if (mode === "register") {
    return <RegisterForm onSwitch={() => setMode("signin")} />
  }
  return <SignInForm onSwitch={() => setMode("register")} />
}
