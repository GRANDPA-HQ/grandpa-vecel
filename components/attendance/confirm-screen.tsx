"use client"

import { useEffect } from "react"
import { Check } from "lucide-react"

export function ConfirmScreen({
  message,
  subMessage,
  onDone,
}: {
  message: string
  subMessage: string
  onDone: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white">
        <Check className="h-7 w-7" />
      </div>
      <p className="text-lg font-semibold">{message}</p>
      <p className="text-sm text-muted-foreground">{subMessage}</p>
      <p className="mt-2 text-xs text-muted-foreground">잠시 후 처음 화면으로 돌아갑니다</p>
    </div>
  )
}
