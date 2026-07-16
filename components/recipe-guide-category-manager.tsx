"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  addRecipeGuideCategory,
  renameRecipeGuideCategory,
  deleteRecipeGuideCategory,
} from "@/app/actions/recipe-guide-categories"
import { X, Plus, Pencil, Trash2, Check } from "lucide-react"

export type ManagedCategory = { id: string; name: string }

export function RecipeGuideCategoryManager({
  categories,
  onClose,
}: {
  categories: ManagedCategory[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  function run(action: () => Promise<{ error?: string; success?: boolean }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else {
        after?.()
        router.refresh()
      }
    })
  }

  function handleAdd() {
    if (!newName.trim()) return
    run(() => addRecipeGuideCategory(newName), () => setNewName(""))
  }

  function handleRename(id: string) {
    if (!editName.trim()) return
    run(() => renameRecipeGuideCategory(id, editName), () => setEditingId(null))
  }

  function handleDelete(id: string) {
    run(() => deleteRecipeGuideCategory(id), () => setConfirmDeleteId(null))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-border bg-background shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-semibold">분류 관리</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 새 분류 추가 */}
        <div className="flex items-center gap-2 border-b border-border/50 px-5 py-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleAdd()
              }
            }}
            placeholder="새 분류 이름"
            className="h-8 text-sm"
            disabled={isPending}
          />
          <Button size="sm" onClick={handleAdd} disabled={isPending || !newName.trim()} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            추가
          </Button>
        </div>

        {/* 분류 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {categories.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">등록된 분류가 없습니다.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/50">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center gap-2 py-2">
                  {editingId === c.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleRename(c.id)
                          }
                          if (e.key === "Escape") setEditingId(null)
                        }}
                        autoFocus
                        className="h-8 flex-1 text-sm"
                        disabled={isPending}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleRename(c.id)}
                        disabled={isPending || !editName.trim()}
                        className="gap-1"
                      >
                        <Check className="h-3.5 w-3.5" />
                        저장
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={isPending}>
                        취소
                      </Button>
                    </>
                  ) : confirmDeleteId === c.id ? (
                    <>
                      <span className="flex-1 text-sm">
                        <strong>{c.name}</strong> 분류를 삭제할까요?
                        <span className="ml-1 text-xs text-muted-foreground">(기존 가이드 표시는 유지됨)</span>
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(c.id)}
                        disabled={isPending}
                      >
                        삭제
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)} disabled={isPending}>
                        취소
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(c.id)
                          setEditName(c.name)
                          setConfirmDeleteId(null)
                        }}
                        title="이름 수정"
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteId(c.id)
                          setEditingId(null)
                        }}
                        title="삭제"
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 에러 + 안내 */}
        {error && <p className="px-5 pb-2 text-xs text-destructive">{error}</p>}
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          이름을 수정하면 해당 분류를 쓰는 기존 가이드에도 새 이름이 적용됩니다.
        </p>
      </div>
    </div>
  )
}
