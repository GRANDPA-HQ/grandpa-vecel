"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, Plus } from "lucide-react"
import { addSubmatZoneLink, removeSubmatZoneLink } from "@/app/actions/submat-zone"

type ZoneOption = { value: string; label: string; group?: string }

// zone_group 중 특정 파트 전용이 아니라 KP/SP가 함께 쓰는 공용 존 그룹.
// (예: OPSZ-2 "소모품·부자재 보관 존"은 tb_zone_type_mst 메모에 "KP/SP 공용"이라고 명시돼 있음)
const SHARED_ZONE_GROUPS = new Set(["OPS"])

export function SubmatZoneCell({
  submatId,
  initialZoneIds,
  zoneOptions,
  managePartId,
}: {
  submatId: string
  // 이 부자재에 이미 연결된 zone_type_id 목록
  initialZoneIds: string[]
  // 전체 Zone유형 옵션 (tb_zone_type_mst)
  zoneOptions: ZoneOption[]
  // 이 부자재의 관리 파트(SP/KP) — 존 추가 선택지를 해당 파트(+ 공용 존)로 좁히는 데 씀.
  // SP/KP가 아닌 값(빈 값 등)이면 예전처럼 전체 존을 보여준다 (안전한 기본 동작 유지).
  managePartId?: string
}) {
  const [zoneIds, setZoneIds] = useState(initialZoneIds)
  const [adding, setAdding] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const labelOf = (id: string) => zoneOptions.find((o) => o.value === id)?.label ?? id
  const partFiltered =
    managePartId === "SP" || managePartId === "KP"
      ? zoneOptions.filter((o) => o.group === managePartId || (o.group && SHARED_ZONE_GROUPS.has(o.group)))
      : zoneOptions
  const remainingOptions = partFiltered.filter((o) => !zoneIds.includes(o.value))

  function handleAdd(zoneTypeId: string) {
    if (!zoneTypeId) return
    setAdding(false)
    setError(null)
    setZoneIds((prev) => [...prev, zoneTypeId])
    startTransition(async () => {
      const result = await addSubmatZoneLink(submatId, zoneTypeId)
      if (result.error) {
        setZoneIds((prev) => prev.filter((id) => id !== zoneTypeId))
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  function handleRemove(zoneTypeId: string) {
    setError(null)
    setZoneIds((prev) => prev.filter((id) => id !== zoneTypeId))
    startTransition(async () => {
      const result = await removeSubmatZoneLink(submatId, zoneTypeId)
      if (result.error) {
        setZoneIds((prev) => [...prev, zoneTypeId])
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {zoneIds.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-amber-800"
          >
            {labelOf(id)}
            <button
              type="button"
              onClick={() => handleRemove(id)}
              disabled={isPending}
              title="연결 해제"
              className="rounded-full p-0.5 text-amber-600 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {adding ? (
          <select
            autoFocus
            defaultValue=""
            onChange={(e) => handleAdd(e.target.value)}
            onBlur={() => setAdding(false)}
            className="rounded-full border border-input bg-background px-2 py-0.5 text-xs outline-none ring-1 ring-ring"
          >
            <option value="" disabled>
              존 선택
            </option>
            {remainingOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={isPending || remainingOptions.length === 0}
            title={remainingOptions.length === 0 ? "모든 존이 연결됨" : "존 추가"}
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-input px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            추가
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
