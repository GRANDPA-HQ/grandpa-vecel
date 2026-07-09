"use client"

import { useState, useActionState } from "react"
import { Button } from "@/components/ui/button"
import { RecipeGuideComposer, type SkuRecipeSummary } from "@/components/recipe-guide-composer"
import { RecipeGuideEditModal } from "@/components/recipe-guide-edit-modal"
import { deleteRecipeGuide } from "@/app/actions/recipe-guides"
import { PenLine, ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react"

type RecipeGuide = {
  id: string
  title: string
  category: string | null
  content: string
  created_at: string
  author: { name: string } | null
}

// 분류 드롭다운 기본 옵션 (기존 가이드에서 사용 중인 분류가 여기에 합쳐짐)
const DEFAULT_CATEGORIES = ["전처리", "조리", "위생"]

function RecipeGuideCard({ item, categories }: { item: RecipeGuide; categories: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteState, deleteAction, deleting] = useActionState(deleteRecipeGuide, undefined)

  return (
    <>
      <div className="rounded-lg border border-border bg-card transition-colors hover:border-muted-foreground/30">
        {/* 헤더 (클릭 시 펼침) */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-start justify-between gap-3 p-5 text-left"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-card-foreground">{item.title}</h3>
              {item.category && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {item.category}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{item.author?.name ?? "알 수 없음"}</span>
              <span>·</span>
              <span>
                {new Date(item.created_at).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
          <span className="mt-0.5 shrink-0 text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>

        {/* 본문 + 버튼 */}
        {expanded && (
          <div className="border-t border-border/50">
            <div
              className="recipe-content px-5 pt-4 pb-3 text-sm text-card-foreground"
              dangerouslySetInnerHTML={{ __html: item.content }}
            />

            {deleteState?.error && (
              <p className="px-5 pb-2 text-xs text-destructive">{deleteState.error}</p>
            )}

            <div className="flex items-center justify-end gap-2 px-5 pb-4">
              {confirmDelete ? (
                <>
                  <span className="mr-1 text-xs text-muted-foreground">정말 삭제하시겠어요?</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                  >
                    취소
                  </Button>
                  <form action={deleteAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="destructive"
                      className="gap-1.5"
                      disabled={deleting}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deleting ? "삭제 중..." : "삭제 확인"}
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmDelete(true)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditing(true)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    수정
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <RecipeGuideEditModal guide={item} onClose={() => setEditing(false)} categories={categories} />
      )}
    </>
  )
}

export function RecipeGuideList({
  guides,
  authorName,
  skuRecipes,
}: {
  guides: RecipeGuide[]
  authorName: string
  skuRecipes?: SkuRecipeSummary[]
}) {
  const [open, setOpen] = useState(false)

  const categories = Array.from(
    new Set([
      ...DEFAULT_CATEGORIES,
      ...guides.map((g) => g.category).filter((c): c is string => !!c),
    ]),
  )

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} size="sm" className="gap-2">
          <PenLine className="h-4 w-4" />
          레시피 가이드 작성
        </Button>
      </div>

      {guides.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-24 text-center">
          <p className="text-sm font-medium text-muted-foreground">등록된 레시피 가이드가 없습니다</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            레시피 가이드 작성 버튼을 눌러 첫 가이드를 등록해보세요
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {guides.map((item) => (
            <RecipeGuideCard key={item.id} item={item} categories={categories} />
          ))}
        </div>
      )}

      {open && (
        <RecipeGuideComposer
          authorName={authorName}
          onClose={() => setOpen(false)}
          skuRecipes={skuRecipes}
          categories={categories}
        />
      )}
    </>
  )
}
