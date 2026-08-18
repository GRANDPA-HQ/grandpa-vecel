"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Columns3, GripVertical } from "lucide-react"
import { COLUMN_LABELS } from "@/lib/column-labels"
import { setHiddenColumns, setColumnOrder } from "@/app/actions/column-prefs"
import { cn } from "@/lib/utils"

// 노션의 "속성 표시 여부" 패널과 동일한 개념 — 표시 여부·순서 모두 계정별이 아니라
// 테이블당 하나뿐인 전체 공통 설정이라 누가 바꾸든 모든 직원 화면에 그대로 반영되고,
// 새로고침·재로그인해도 유지된다.
export function ColumnSettingsMenu({
  tableName,
  allColumns,
  hiddenColumns,
}: {
  tableName: string
  allColumns: string[]
  hiddenColumns: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [order, setOrder] = useState<string[]>(allColumns)
  const [pendingHidden, setPendingHidden] = useState<Set<string>>(new Set(hiddenColumns))
  const [isPending, startTransition] = useTransition()
  const [rect, setRect] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragIndex = useRef<number | null>(null)

  // 서버에서 새로 내려온 값(다른 사람이 바꾼 설정 포함)으로 동기화
  useEffect(() => {
    setPendingHidden(new Set(hiddenColumns))
  }, [hiddenColumns])
  useEffect(() => {
    setOrder(allColumns)
  }, [allColumns])

  useEffect(() => {
    if (!open) return

    function updatePosition() {
      const el = buttonRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    updatePosition()

    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleEsc)
    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("resize", updatePosition)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleEsc)
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("resize", updatePosition)
    }
  }, [open])

  function persistHidden(next: Set<string>) {
    setPendingHidden(next)
    startTransition(async () => {
      await setHiddenColumns(tableName, Array.from(next))
      router.refresh()
    })
  }

  function toggleHidden(col: string) {
    const next = new Set(pendingHidden)
    if (next.has(col)) next.delete(col)
    else next.add(col)
    persistHidden(next)
  }

  function persistOrder(next: string[]) {
    startTransition(async () => {
      await setColumnOrder(tableName, next)
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
    setOrder((prev) => {
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
    persistOrder(order)
  }

  const hiddenCount = pendingHidden.size

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
      >
        <Columns3 className="h-3.5 w-3.5" />
        열 관리{hiddenCount > 0 ? ` (${hiddenCount}개 숨김)` : ""}
      </button>

      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: rect.top, right: rect.right, width: 260 }}
            className="z-50 rounded-md border border-border bg-popover shadow-md"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold">열 표시 · 순서</span>
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => persistHidden(new Set())}
                  className="text-[11px] text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  모두 보이기
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {order.map((col, index) => {
                const checked = !pendingHidden.has(col)
                return (
                  <div
                    key={col}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => e.preventDefault()}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "flex cursor-default select-none items-center gap-1.5 px-2 py-1.5 text-xs hover:bg-accent",
                      dragIndex.current === index && "opacity-50",
                    )}
                  >
                    <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                    <label className="flex flex-1 cursor-pointer items-center gap-2 truncate">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isPending}
                        onChange={() => toggleHidden(col)}
                        className="h-3.5 w-3.5 shrink-0 accent-primary"
                      />
                      <span className="truncate">{COLUMN_LABELS[col] ?? col}</span>
                    </label>
                  </div>
                )
              })}
            </div>
            <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
              모든 직원에게 공통으로 적용되는 설정입니다
            </p>
          </div>,
          document.body,
        )}
    </div>
  )
}
