"use client"

import { useCallback, useMemo } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { SearchableSelect } from "@/components/searchable-select"
import { PART_CODES_BY_STORE_SCOPE } from "@/lib/table-config"

type Option = { value: string; label: string }
type PartOption = Option & { code: string }

// 직원 관리 목록 상단의 지점/파트 선택 필터 — URL 쿼리(store, part)로 상태를 관리해
// 새로고침·뒤로가기에도 선택이 유지된다.
// 특정 지점을 고르면, 그 지점의 scope(store/hq)에 맞는 파트만 파트 선택지에 남긴다.
// 전체 지점일 때는 scope를 하나로 정할 수 없으므로 전체 파트를 보여준다.
export function EmployeeFilters({
  storeOptions,
  partOptions,
  storeScopeMap,
}: {
  storeOptions: Option[]
  partOptions: PartOption[]
  storeScopeMap: Record<string, string>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeStore = searchParams.get("store") ?? ""
  const activePart = searchParams.get("part") ?? ""

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      // 지점을 바꿔 이전에 고른 파트가 새 지점의 scope에 없으면 파트 선택도 같이 초기화
      if (key === "store") params.delete("part")
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams],
  )

  const scopedPartOptions = useMemo(() => {
    if (!activeStore) return partOptions
    const scope = storeScopeMap[activeStore]
    const allowedCodes = scope ? PART_CODES_BY_STORE_SCOPE[scope] : undefined
    return allowedCodes ? partOptions.filter((o) => allowedCodes.includes(o.code)) : partOptions
  }, [activeStore, partOptions, storeScopeMap])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchableSelect
        className="w-48 shrink-0"
        value={activeStore}
        onChange={(v) => setParam("store", v)}
        placeholder="전체 지점"
        searchPlaceholder="지점 검색..."
        options={[{ value: "", label: "전체 지점" }, ...storeOptions]}
      />
      <SearchableSelect
        className="w-40 shrink-0"
        value={activePart}
        onChange={(v) => setParam("part", v)}
        placeholder="전체 파트"
        searchPlaceholder="파트 검색..."
        options={[{ value: "", label: "전체 파트" }, ...scopedPartOptions]}
      />
    </div>
  )
}
