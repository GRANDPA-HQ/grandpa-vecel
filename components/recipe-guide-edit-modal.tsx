"use client"

import { useActionState, useEffect } from "react"
import { updateRecipeGuide } from "@/app/actions/recipe-guides"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RichTextEditor } from "@/components/rich-text-editor"
import { X, Save } from "lucide-react"

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

  useEffect(() => {
    if (state?.success) setTimeout(onClose, 300)
  }, [state?.success, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 flex h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-background shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-semibold">레시피 가이드 수정</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>
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
