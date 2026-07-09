"use client"

import { useActionState, useEffect, useRef } from "react"
import { createRecipeGuide } from "@/app/actions/recipe-guides"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RichTextEditor, type RichTextEditorApi } from "@/components/rich-text-editor"
import { SearchableSelect } from "@/components/searchable-select"
import { X, Send } from "lucide-react"

// 판매 레시피(SKU별 생산품 구성) 요약 — 드롭다운 선택 시 본문에 삽입됨
export type SkuRecipeSummary = {
  skuId: string
  label: string
  rows: { prodLabel: string; amount: number; unit: string; memo: string | null }[]
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// 선택한 판매 레시피를 에디터에 삽입할 HTML 블록으로 변환
function recipeToHtml(recipe: SkuRecipeSummary): string {
  const items = recipe.rows
    .map((r) => {
      const memo = r.memo ? ` <em>(${escapeHtml(r.memo)})</em>` : ""
      return `<li><p>${escapeHtml(r.prodLabel)} — <strong>${r.amount}${escapeHtml(r.unit)}</strong>${memo}</p></li>`
    })
    .join("")
  return `<h3>${escapeHtml(recipe.label)}</h3><ol>${items}</ol><p></p>`
}

export function RecipeGuideComposer({
  authorName,
  onClose,
  skuRecipes,
  categories = [],
}: {
  authorName: string
  onClose: () => void
  skuRecipes?: SkuRecipeSummary[]
  categories?: string[]
}) {
  const [state, formAction, pending] = useActionState(createRecipeGuide, undefined)
  const editorApi = useRef<RichTextEditorApi | null>(null)

  function handleRecipeSelect(skuId: string) {
    const recipe = skuRecipes?.find((r) => r.skuId === skuId)
    if (!recipe) return
    editorApi.current?.insertHtml(recipeToHtml(recipe))
  }

  useEffect(() => {
    if (state?.success) setTimeout(onClose, 300)
  }, [state?.success, onClose])

  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 flex h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-background shadow-2xl">
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-semibold">새 레시피 가이드 작성</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form action={formAction} className="flex flex-1 flex-col overflow-hidden">
          {/* 이메일 메타 필드 */}
          <div className="shrink-0 border-b border-border">
            {/* 보내는 이 */}
            <div className="flex items-center gap-3 border-b border-border/50 px-5 py-2.5">
              <span className="w-16 shrink-0 text-xs text-muted-foreground">보내는 이</span>
              <span className="text-sm">{authorName}</span>
            </div>

            {/* 날짜 */}
            <div className="flex items-center gap-3 border-b border-border/50 px-5 py-2.5">
              <span className="w-16 shrink-0 text-xs text-muted-foreground">날짜</span>
              <span className="text-sm text-muted-foreground">{today}</span>
            </div>

            {/* 분류 (자유 입력이 아닌 선택) */}
            <div className="flex items-center gap-3 border-b border-border/50 px-5 py-2.5">
              <label htmlFor="rg-category" className="w-16 shrink-0 text-xs text-muted-foreground">
                분류
              </label>
              <select
                id="rg-category"
                name="category"
                defaultValue=""
                className="cursor-pointer bg-transparent text-sm focus:outline-none"
              >
                <option value="">— 분류 선택 (선택사항) —</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* 판매 레시피 불러오기 */}
            {skuRecipes && skuRecipes.length > 0 && (
              <div className="flex items-center gap-3 border-b border-border/50 px-5 py-2.5">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">레시피</span>
                <SearchableSelect
                  className="w-72"
                  value=""
                  onChange={handleRecipeSelect}
                  placeholder="판매 레시피 선택 시 본문에 자동 삽입"
                  searchPlaceholder="SKU 코드/이름 검색..."
                  options={skuRecipes.map((r) => ({ value: r.skuId, label: r.label }))}
                />
              </div>
            )}

            {/* 제목 */}
            <div className="flex items-center gap-3 px-5 py-2.5">
              <label htmlFor="rg-title" className="w-16 shrink-0 text-xs text-muted-foreground">
                제목
              </label>
              <Input
                id="rg-title"
                name="title"
                placeholder="레시피 가이드 제목을 입력하세요"
                required
                autoFocus
                className="h-auto border-none bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          {/* 리치 텍스트 에디터 본문 */}
          <div className="flex flex-1 flex-col overflow-hidden px-5 py-4">
            <RichTextEditor
              name="content"
              placeholder="레시피 가이드 내용을 작성하세요..."
              apiRef={editorApi}
            />
          </div>

          {/* 에러 */}
          {state?.error && (
            <p className="px-5 pb-2 text-xs text-destructive" role="alert">
              {state.error}
            </p>
          )}

          {/* 하단 툴바 */}
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>
              취소
            </Button>
            <Button type="submit" size="sm" disabled={pending} className="gap-2">
              <Send className="h-3.5 w-3.5" />
              {pending ? "등록 중..." : "등록"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
