"use client"

import { useState, useTransition } from "react"
import { Check, Loader2 } from "lucide-react"
import { updateRow } from "@/app/actions/table-edit"
import { cn } from "@/lib/utils"

export function InventoryStockCell({
  tableName,
  pkColumn,
  pkValue,
  initialQty,
}: {
  tableName: string
  pkColumn: string
  pkValue: string
  initialQty: number
}) {
  const [value, setValue] = useState(String(initialQty))
  const [saved, setSaved] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleChange(next: string) {
    setValue(next)
    setSaved(next === String(initialQty))
    setError(null)
  }

  function handleSave() {
    const n = Number(value)
    if (Number.isNaN(n)) {
      setError("숫자를 입력하세요")
      return
    }
    startTransition(async () => {
      const { error } = await updateRow(tableName, pkColumn, pkValue, "stock_qty", String(n), "number")
      if (error) {
        setError(error)
        return
      }
      setSaved(true)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onWheel={(e) => e.currentTarget.blur()}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault()
          if (e.key === "Enter") handleSave()
        }}
        className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saved || isPending}
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
          saved
            ? "text-muted-foreground/40"
            : "bg-emerald-600 text-white hover:bg-emerald-700",
        )}
        title="저장"
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
