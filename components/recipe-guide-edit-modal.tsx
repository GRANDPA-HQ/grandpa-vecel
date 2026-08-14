"use client"

import { useActionState, useEffect, useState } from "react"
import { updateRecipeGuide } from "@/app/actions/recipe-guides"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RichTextEditor } from "@/components/rich-text-editor"
import { X, Save, Check } from "lucide-react"
import { cn } from "@/lib/utils"

type RecipeGuide = {
  id: string
  title: string
  category: string | null
  content: string
}

export function RecipeGuideEditModal({
  guide,
  onClose,
  categories = [],
}: {
  guide: RecipeGuide
  onClose: () => void
  categories?: string[]
}) {
  // 기존 분류가 옵션 목록에 없어도 선택 상태가 유지되도록 포함
  const categoryOptions =
    guide.category && !categories.includes(guide.category)
      ? [guide.category, ...categories]
      : categories
  const [state, formAction, pending] = useActionState(updateRecipeGuide, undefined)

  // 저장 요청이 서버에 전송된 후(pending)에는 실수로 배경을 클릭하거나 X를
  // 눌러 창이 닫히지 않도록 막는다 — 저장이 끝났는지 모른 채 창이 사라지는
  // 것을 막기 위함
  function handleRequestClose() {
    if (pending) return
    onClose()
  }

  // 저장 완료 토스트 — 살짝 위에서 내려오며 표시되도록 마운트 다음 틱에 켠다
  const [toastVisible, setToastVisible] = useState(false)

  useEffect(() => {
    if (!state?.success) return
    // 저장 완료 토스트를 띄우고, 확인할 시간을 준 뒤 창을 닫는다
    // (기존엔 300ms 만에 조용히 닫혀서 저장됐는지 확인하기 전에 사라진다는 피드백이 있었음)
    const showTimer = setTimeout(() => setToastVisible(true), 10)
    const closeTimer = setTimeout(onClose, 1400)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(closeTimer)
    }
  }, [state?.success, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={handleRequestClose} />

      <div className="relative z-10 flex h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-background shadow-2xl">
        {/* 저장 완료 토스트 — 모달 위쪽 중앙에 눈에 띄게 표시 */}
        {state?.success && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
            <div
              className={cn(
                "pointer-events-auto flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xl transition-all duration-300",
                toastVisible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0",
              )}
              role="status"
            >
              <Check className="h-4 w-4" />
              저장되었습니다
            </div>
          </div>
        )}

        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-semibold">
            레시피 가이드 수정
            {pending && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">저장 중… 잠시만요</span>
            )}
          </span>
          <button
            type="button"
            onClick={handleRequestClose}
            disabled={pending}
            title={pending ? "저장이 끝날 때까지 잠시만 기다려주세요" : undefined}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form action={formAction} className="flex flex-1 flex-col overflow-hidden">
          {/* 숨김 id */}
          <input type="hidden" name="id" value={guide.id} />

          {/* 메타 필드 */}
          <div className="shrink-0 border-b border-border">
            {/* 분류 (자유 입력이 아닌 선택) */}
            <div className="flex items-center gap-3 border-b border-border/50 px-5 py-2.5">
              <label htmlFor="edit-category" className="w-16 shrink-0 text-xs text-muted-foreground">
                분류
              </label>
              <select
                id="edit-category"
                name="category"
                defaultValue={guide.category ?? ""}
                className="cursor-pointer bg-transparent text-sm focus:outline-none"
              >
                <option value="">— 분류 선택 (선택사항) —</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* 제목 */}
            <div className="flex items-center gap-3 px-5 py-2.5">
              <label htmlFor="edit-title" className="w-16 shrink-0 text-xs text-muted-foreground">
                제목
              </label>
              <Input
                id="edit-title"
                name="title"
                defaultValue={guide.title}
                placeholder="레시피 가이드 제목을 입력하세요"
                required
                autoFocus
                className="h-auto border-none bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          {/* 리치 텍스트 에디터 */}
          <div className="flex flex-1 flex-col overflow-hidden px-5 py-4">
            <RichTextEditor
              name="content"
              defaultContent={guide.content}
              placeholder="레시피 가이드 내용을 입력하세요..."
            />
          </div>

          {/* 에러 */}
          {state?.error && (
            <p className="px-5 pb-2 text-xs text-destructive" role="alert">
              {state.error}
            </p>
          )}

          {/* 하단 */}
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={handleRequestClose} disabled={pending}>
              취소
            </Button>
            <Button type="submit" size="sm" disabled={pending} className="gap-2">
              <Save className="h-3.5 w-3.5" />
              {pending ? "저장 중..." : "저장"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
