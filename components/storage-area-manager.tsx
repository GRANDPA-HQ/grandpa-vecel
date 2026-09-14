"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { GripVertical, Pencil, Trash2, Plus, PackageSearch } from "lucide-react"
import {
  createStorageArea,
  renameStorageArea,
  deleteStorageArea,
  setStorageAreaActive,
  reorderStorageAreas,
} from "@/app/actions/storage-areas"
import { cn } from "@/lib/utils"

export type StorageAreaRow = {
  id: string
  areaName: string
  sortOrder: number
  isActive: boolean
  mappedCount: number
  categoryTags: string[]
}

export function StorageAreaManager({
  storeId,
  initialAreas,
}: {
  storeId: string
  initialAreas: StorageAreaRow[]
}) {
  const router = useRouter()
  const [areas, setAreas] = useState<StorageAreaRow[]>(initialAreas)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newAreaName, setNewAreaName] = useState("")
  const [blockInfo, setBlockInfo] = useState<{ areaName: string; mappedCount: number } | null>(null)
  const dragIndex = useRef<number | null>(null)

  useEffect(() => {
    setAreas(initialAreas)
  }, [initialAreas])

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = newAreaName.trim()
    if (!name) return
    setError(null)
    startTransition(async () => {
      const result = await createStorageArea(storeId, name)
      if (result.error) {
        setError(result.error)
        return
      }
      setNewAreaName("")
      setAddOpen(false)
      router.refresh()
    })
  }

  function handleDelete(area: StorageAreaRow) {
    const msg =
      area.mappedCount > 0
        ? `"${area.areaName}" 영역을 삭제하시겠습니까?\n아직 매핑된 부자재 ${area.mappedCount}종이 있습니다 — 삭제하면 매핑도 함께 사라집니다.\n비활성화를 권장합니다.`
        : `"${area.areaName}" 영역을 삭제하시겠습니까?`
    if (!window.confirm(msg)) return
    setError(null)
    startTransition(async () => {
      const result = await deleteStorageArea(area.id, storeId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  function handleToggleActive(area: StorageAreaRow) {
    const nextActive = !area.isActive
    if (!nextActive && area.mappedCount > 0) {
      setBlockInfo({ areaName: area.areaName, mappedCount: area.mappedCount })
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await setStorageAreaActive(area.id, storeId, nextActive)
      if (result.error) {
        if (result.mappedCount !== undefined) {
          setBlockInfo({ areaName: area.areaName, mappedCount: result.mappedCount })
        } else {
          setError(result.error)
        }
        return
      }
      router.refresh()
    })
  }

  function handleDragStart(index: number) {
    dragIndex.current = index
  }
  function handleDragOver(e: React.DragEvent, overIndex: number) {
    e.preventDefault()
    const from = dragIndex.current
    if (from === null || from === overIndex) return
    setAreas((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(overIndex, 0, moved)
      return next
    })
    dragIndex.current = overIndex
  }
  function handleDragEnd() {
    if (dragIndex.current === null) return
    dragIndex.current = null
    setError(null)
    startTransition(async () => {
      const result = await reorderStorageAreas(storeId, areas.map((a) => a.id))
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-relaxed text-emerald-900">
          <b>순서 = 실사 동선.</b> 스태프가 태블릿으로 실사할 때 위에서부터 차례로 돕니다. 왼쪽
          손잡이를 끌어 순서를 바꾸세요. 각 영역에 부자재를 담는 <b>매핑은 스태프</b>가 별도 화면에서
          합니다.
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          새 영역 추가
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {areas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
          <PackageSearch className="h-8 w-8" />
          <p className="text-sm">등록된 보관영역이 없습니다.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {areas.map((area, index) => (
            <AreaCard
              key={area.id}
              storeId={storeId}
              area={area}
              orderLabel={area.isActive ? index + 1 : null}
              isPending={isPending}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onDelete={() => handleDelete(area)}
              onToggleActive={() => handleToggleActive(area)}
              onRenamed={() => router.refresh()}
            />
          ))}
        </div>
      )}

      <div className="mt-2 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        <b className="text-foreground">이 화면의 역할 (매니저 이상)</b>
        <br />
        · 지점별 보관영역을 만들고 · 이름을 바꾸고 · 실사 순서를 정하고 · 사용여부를 켜고 끕니다.
        <br />
        · <b className="text-foreground">비활성(토글 OFF)</b> 영역은 스태프 실사 대상에서 제외됩니다.
        <br />
        · 각 영역에 어떤 부자재가 들어있는지 담는 매핑은 스태프 화면에서 처리 — &quot;부자재 N종&quot;은
        그 결과를 읽기 전용으로 표시합니다.
        <br />
        · 부자재 1종은 여러 영역에 나뉘어 담길 수 있고, 실사는 영역별로 세서 합산합니다.
        <br />
        · 부자재가 매핑된 영역은 삭제보다 비활성을 권장합니다.
        <br />
        · <b className="text-foreground">비활성 전환은 매핑 0종일 때만</b> 가능합니다. 부자재가 남아있으면
        먼저 스태프에게 다른 영역으로 이동(재매핑)을 요청하세요.
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAddOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">새 보관영역 추가</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  영역 이름
                </label>
                <input
                  autoFocus
                  type="text"
                  value={newAreaName}
                  onChange={(e) => setNewAreaName(e.target.value)}
                  placeholder="예: 주방 선반 B, 냉장고 옆 선반"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  스태프가 실사할 때 보게 될 이름입니다. 지점에서 실제로 부르는 구역 명칭으로
                  지어주세요. 코드는 없습니다.
                </p>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isPending || !newAreaName.trim()}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  추가
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {blockInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setBlockInfo(null)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
            <h2 className="mb-3 text-lg font-semibold text-amber-700">
              ⚠ 비활성으로 바꿀 수 없습니다
            </h2>
            <p className="text-sm leading-relaxed">
              <b>{blockInfo.areaName}</b>에 아직{" "}
              <b className="text-amber-700">{blockInfo.mappedCount}</b>종의 부자재가 담겨 있습니다.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              비활성 영역은 실사에서 제외되므로, 담긴 재고가 사라지지 않도록 먼저 물품을 다른
              영역으로 옮겨야 합니다. 스태프에게 이 영역의 부자재를 다른 보관영역으로
              재매핑(이동)하도록 요청한 뒤, 매핑이 0종이 되면 다시 시도하세요.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setBlockInfo(null)}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AreaCard({
  storeId,
  area,
  orderLabel,
  isPending,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDelete,
  onToggleActive,
  onRenamed,
}: {
  storeId: string
  area: StorageAreaRow
  orderLabel: number | null
  isPending: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDelete: () => void
  onToggleActive: () => void
  onRenamed: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(area.areaName)
  const [renamePending, startRenameTransition] = useTransition()
  const [renameError, setRenameError] = useState<string | null>(null)

  useEffect(() => {
    setName(area.areaName)
  }, [area.areaName])

  function commitRename() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === area.areaName) {
      setName(area.areaName)
      setEditing(false)
      return
    }
    setRenameError(null)
    startRenameTransition(async () => {
      const result = await renameStorageArea(area.id, storeId, trimmed)
      if (result.error) {
        setRenameError(result.error)
        setName(area.areaName)
      } else {
        onRenamed()
      }
      setEditing(false)
    })
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      className={cn(
        "flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 shadow-sm",
        !area.isActive && "opacity-50",
      )}
    >
      <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 font-mono text-sm font-bold text-emerald-800">
        {orderLabel ?? "–"}
      </span>

      {editing ? (
        <input
          autoFocus
          value={name}
          disabled={renamePending}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") {
              setName(area.areaName)
              setEditing(false)
            }
          }}
          className="min-w-[160px] rounded-md border border-input bg-background px-2 py-1 text-sm font-semibold outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <span className="min-w-[160px] shrink-0 text-base font-semibold">{area.areaName}</span>
      )}

      <span className="shrink-0 text-xs text-muted-foreground">
        부자재 <b className="text-emerald-700">{area.mappedCount}</b>종
        {!area.isActive && " · 실사 제외"}
      </span>

      <div className="flex flex-1 flex-wrap gap-1.5">
        {area.categoryTags.map((tag) => (
          <span key={tag} className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {tag}
          </span>
        ))}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          title="이름 수정"
          disabled={isPending}
          onClick={() => setEditing(true)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-input text-muted-foreground hover:border-emerald-600 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="삭제"
          disabled={isPending}
          onClick={onDelete}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-input text-muted-foreground hover:border-destructive hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <label className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            checked={area.isActive}
            disabled={isPending}
            onChange={onToggleActive}
            className="peer sr-only"
          />
          <span className="absolute inset-0 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-emerald-600" />
          <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </label>
      </div>

      {renameError && <p className="w-full text-xs text-destructive">{renameError}</p>}
    </div>
  )
}
