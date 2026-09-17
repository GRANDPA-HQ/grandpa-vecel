"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"

/**
 * PIN 발급/재발급 직후 평문 PIN을 한 번만 보여주는 다이얼로그.
 * PIN은 해시로만 저장되므로 이 화면을 벗어나면 다시 볼 수 없다 — 직원 관리 페이지의
 * PIN 발급 버튼(components/employee-table.tsx)에서 사용한다.
 *
 * document.body로 포탈 렌더링한다: 직원 관리 테이블의 각 행(tr) 안에서 열리므로,
 * 포탈 없이 그대로 렌더링하면 <tbody> 하위에 <div>가 끼어드는 유효하지 않은 테이블
 * DOM 구조가 된다.
 */
export function IssuedPinDialog({
  name,
  pin,
  emailWarning,
  onClose,
}: {
  name: string
  pin: string
  emailWarning?: string
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-background p-6 text-center shadow-xl">
        <h2 className="text-lg font-semibold">{name}님 PIN 발급 완료</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          이 화면을 벗어나면 다시 볼 수 없습니다 — 지금 바로 직원분께 전달해 주세요.
        </p>
        <p className="mt-4 text-4xl font-bold tracking-[0.3em]">{pin}</p>
        {emailWarning ? (
          <p className="mt-4 text-sm text-destructive">{emailWarning}</p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">직원 이메일로도 PIN을 발송했습니다.</p>
        )}
        <Button className="mt-6 w-full" onClick={onClose}>
          확인했습니다
        </Button>
      </div>
    </div>,
    document.body,
  )
}
