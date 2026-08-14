"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { createRecipeGuide } from "@/app/actions/recipe-guides"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RichTextEditor, type RichTextEditorApi } from "@/components/rich-text-editor"
import { SearchableSelect } from "@/components/searchable-select"
import { X, Send, Sparkles, Eye, EyeOff, Check } from "lucide-react"
import { useDraggableModal } from "@/components/use-draggable-modal"
import { cn } from "@/lib/utils"

// 판매 레시피(SKU별 생산품 구성) 요약 — 드롭다운 선택 시 본문에 삽입됨
export type SkuRecipeSummary = {
  skuId: string
  label: string
  rows: { prodLabel: string; amount: number; unit: string; memo: string | null }[]
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// 선택한 판매 레시피를 편집 가능한 본문(제목 + 번호 목록)으로 변환해 삽입한다.
// 삽입 시점의 구성이 그대로 저장되므로 이후 레시피가 수정돼도 본문에는 반영되지 않는다.
// (기존 글에 남아 있는 라이브 마커는 lib/recipe-embed.ts가 열람 시 계속 치환한다)
function recipeToContentHtml(recipe: SkuRecipeSummary): string {
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
  // 뒤의 내용을 보며 작성할 수 있도록 창 드래그 이동 + 임시 숨기기 지원
  // (숨김은 CSS로만 처리해 에디터 작성 내용이 유지된다)
  const { offset, hidden, setHidden, startDrag } = useDraggableModal()

  // 저장 요청이 서버에 전송된 후(pending)에는 실수로 배경을 클릭하거나 X를
  // 눌러 창이 닫히지 않도록 막는다 — 저장이 끝났는지 모른 채 창이 사라지는
  // 것을 막기 위함
  function handleRequestClose() {
    if (pending) return
    onClose()
  }

  // ── 제목 자동 생성 ──────────────────────────────────
  // 분류·선택한 레시피로 "[분류] SKU명 레시피 가이드"를 만든다.
  // 직접 입력한 제목은 덮어쓰지 않고, 비어있거나 자동 생성된 상태일 때만 갱신한다.
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const lastAutoTitle = useRef<string | null>(null)
  const lastRecipe = useRef<SkuRecipeSummary | null>(null)

  // 저장 완료 토스트 — 살짝 위에서 내려오며 표시되도록 마운트 다음 틱에 켠다
  const [toastVisible, setToastVisible] = useState(false)

  function buildTitle(recipe: SkuRecipeSummary | null, cat: string): string {
    // 라벨 "SKU_BEV_001 · 요거트 랜치"에서 이름 부분만 사용
    const name = recipe ? (recipe.label.split("·").pop() ?? recipe.label).trim() : ""
    const prefix = cat ? `[${cat}] ` : ""
    if (name) return `${prefix}${name} 레시피 가이드`
    const date = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
    return `${prefix}${date} 레시피 가이드`
  }

  function applyAutoTitle(recipe: SkuRecipeSummary | null, cat: string, force: boolean) {
    const next = buildTitle(recipe, cat)
    // force(버튼 클릭)가 아니면 직접 입력한 제목은 보존
    if (!force && title !== "" && title !== lastAutoTitle.current) return
    lastAutoTitle.current = next
    setTitle(next)
  }

  function handleCategoryChange(cat: string) {
    setCategory(cat)
    applyAutoTitle(lastRecipe.current, cat, false)
  }

  function handleRecipeSelect(skuId: string) {
    const recipe = skuRecipes?.find((r) => r.skuId === skuId)
    if (!recipe) return
    editorApi.current?.insertHtml(recipeToContentHtml(recipe))
    lastRecipe.current = recipe
    applyAutoTitle(recipe, category, false)
  }

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

  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })

  return (
    <>
      {hidden && (
        <button
          type="button"
          onClick={() => setHidden(false)}
          className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium shadow-lg transition-colors hover:bg-accent"
        >
          <Eye className="h-4 w-4" />
          작성 중인 가이드 열기
        </button>
      )}

    <div className={cn("fixed inset-0 z-50 flex items-center justify-center p-4", hidden && "hidden")}>
      <div className="absolute inset-0 bg-black/40" onClick={handleRequestClose} />

      <div
        className="relative z-10 flex h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-background shadow-2xl"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
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

        {/* 상단 헤더 (드래그하여 창 이동) */}
        <div
          onMouseDown={startDrag}
          title="드래그하여 창 이동"
          className="flex cursor-move select-none items-center justify-between border-b border-border px-5 py-3"
        >
          <span className="text-sm font-semibold">
            새 레시피 가이드 작성
            {pending && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">저장 중… 잠시만요</span>
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHidden(true)}
              title="창을 잠시 숨기고 뒤 내용 보기 (작성 내용 유지)"
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <EyeOff className="h-3 w-3" />
              임시 숨기기
            </button>
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
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
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
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="레시피 가이드 제목을 입력하세요"
                required
                autoFocus
                className="h-auto border-none bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
              />
              <button
                type="button"
                onClick={() => applyAutoTitle(lastRecipe.current, category, true)}
                title="분류·선택한 레시피로 제목 자동 생성"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-500/20"
              >
                <Sparkles className="h-3 w-3" />
                자동 생성
              </button>
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
            <Button type="button" variant="ghost" size="sm" onClick={handleRequestClose} disabled={pending}>
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
    </>
  )
}
