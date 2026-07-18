"use client"

import { useState, useMemo, useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RecipeGuideComposer, type SkuRecipeSummary } from "@/components/recipe-guide-composer"
import { RecipeGuideEditModal } from "@/components/recipe-guide-edit-modal"
import {
  RecipeGuideCategoryManager,
  type ManagedCategory,
} from "@/components/recipe-guide-category-manager"
import { deleteRecipeGuide } from "@/app/actions/recipe-guides"
import { PenLine, ChevronDown, ChevronUp, Pencil, Trash2, Tags, Search } from "lucide-react"

type RecipeGuide = {
  id: string
  title: string
  category: string | null
  content: string
  // 레시피 라이브 마커가 최신 구성으로 치환된 표시용 본문 (수정 시에는 원본 content 사용)
  displayContent?: string
  created_at: string
  author: { name: string } | null
}

// 분류 드롭다운 기본 옵션 (기존 가이드에서 사용 중인 분류가 여기에 합쳐짐)
const DEFAULT_CATEGORIES = ["전처리", "조리", "위생"]

function RecipeGuideRow({
  item,
  number,
  onEdit,
  canDelete,
}: {
  item: RecipeGuide
  number: number
  onEdit: () => void
  // 삭제 버튼 표시 여부 (점장/시니어 직급 전용)
  canDelete: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteState, deleteAction, deleting] = useActionState(deleteRecipeGuide, undefined)

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <TableCell className="text-center text-muted-foreground">{number}</TableCell>
        <TableCell className="text-center">
          {item.category ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {item.category}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell className="w-full max-w-0 truncate">
          <span className="inline-flex max-w-full items-center gap-1.5">
            <span className="truncate font-medium text-card-foreground">{item.title}</span>
            <span className="shrink-0 text-muted-foreground">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </span>
          </span>
        </TableCell>
        <TableCell className="text-center text-muted-foreground">
          {item.author?.name ?? "알 수 없음"}
        </TableCell>
        <TableCell className="text-center text-muted-foreground">
          {new Date(item.created_at).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })}
        </TableCell>
      </TableRow>

      {/* 본문 (행 클릭 시 펼침) */}
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="whitespace-normal bg-muted/30 p-0">
            <div
              className="recipe-content px-5 pt-4 pb-3 text-sm text-card-foreground"
              dangerouslySetInnerHTML={{ __html: item.displayContent ?? item.content }}
            />

            {deleteState?.error && (
              <p className="px-5 pb-2 text-xs text-destructive">{deleteState.error}</p>
            )}

            <div className="flex items-center justify-end gap-2 px-5 pb-4">
              {canDelete && confirmDelete ? (
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
                  {canDelete && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      삭제
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={onEdit}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    수정
                  </Button>
                </>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export function RecipeGuideList({
  guides,
  authorName,
  skuRecipes,
  managedCategories,
  canDelete = false,
}: {
  guides: RecipeGuide[]
  authorName: string
  skuRecipes?: SkuRecipeSummary[]
  // 분류 테이블(recipe_guide_categories) 목록 — null이면 테이블 미생성 (기존 방식 폴백)
  managedCategories?: ManagedCategory[] | null
  // 삭제 버튼 표시 여부 (점장/시니어 직급 전용)
  canDelete?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const [search, setSearch] = useState("")
  // 수정 모달 — tbody 안에 div를 넣을 수 없으므로 테이블 밖에서 렌더링
  const [editingGuide, setEditingGuide] = useState<RecipeGuide | null>(null)

  // 게시글 번호 — 최신 글이 큰 번호 (검색으로 걸러져도 번호 유지)
  const numberById = useMemo(
    () => new Map(guides.map((g, i) => [g.id, guides.length - i])),
    [guides],
  )

  // 제목·분류·작성자·본문(HTML 태그 제거)에서 검색어 매칭
  const filteredGuides = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return guides
    return guides.filter((g) => {
      const plainContent = (g.displayContent ?? g.content).replace(/<[^>]*>/g, " ")
      return [g.title, g.category ?? "", g.author?.name ?? "", plainContent].some((field) =>
        field.toLowerCase().includes(q),
      )
    })
  }, [guides, search])

  // 분류 테이블이 있으면 그 목록만 사용, 없으면 기본값 + 가이드에서 쓰인 분류
  const categories = managedCategories
    ? managedCategories.map((c) => c.name)
    : Array.from(
        new Set([
          ...DEFAULT_CATEGORIES,
          ...guides.map((g) => g.category).filter((c): c is string => !!c),
        ]),
      )

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제목, 분류, 작성자, 내용 검색"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="flex gap-2">
          {managedCategories && (
            <Button onClick={() => setManaging(true)} size="sm" variant="outline" className="gap-2">
              <Tags className="h-4 w-4" />
              분류 관리
            </Button>
          )}
          <Button onClick={() => setOpen(true)} size="sm" className="gap-2">
            <PenLine className="h-4 w-4" />
            레시피 가이드 작성
          </Button>
        </div>
      </div>

      {guides.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-24 text-center">
          <p className="text-sm font-medium text-muted-foreground">등록된 레시피 가이드가 없습니다</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            레시피 가이드 작성 버튼을 눌러 첫 가이드를 등록해보세요
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16 text-center">번호</TableHead>
                <TableHead className="w-24 text-center">분류</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="w-28 text-center">작성자</TableHead>
                <TableHead className="w-32 text-center">작성일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGuides.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-16 text-center text-sm text-muted-foreground">
                    검색 결과가 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                filteredGuides.map((item) => (
                  <RecipeGuideRow
                    key={item.id}
                    item={item}
                    number={numberById.get(item.id) ?? 0}
                    onEdit={() => setEditingGuide(item)}
                    canDelete={canDelete}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {editingGuide && (
        <RecipeGuideEditModal
          guide={editingGuide}
          onClose={() => setEditingGuide(null)}
          categories={categories}
        />
      )}

      {open && (
        <RecipeGuideComposer
          authorName={authorName}
          onClose={() => setOpen(false)}
          skuRecipes={skuRecipes}
          categories={categories}
        />
      )}

      {managing && managedCategories && (
        <RecipeGuideCategoryManager
          categories={managedCategories}
          onClose={() => setManaging(false)}
        />
      )}
    </>
  )
}
