"use client"

import { useMemo, useState } from "react"
import { PackageSearch } from "lucide-react"
import { SearchableSelect } from "@/components/searchable-select"
import { InventoryStockCell } from "@/components/inventory-stock-cell"
import type { SelectOption } from "@/lib/table-config"

const LOW_STOCK_THRESHOLD = 5

// 판매품/원재료/생산품/포장부자재 공통 재고 행 형태 — 테이블마다 다른 컬럼명(sku_code/raw_code 등)은
// 페이지에서 이 형태로 미리 변환해 넘긴다.
export type InventoryRow = {
  pkValue: string
  code: string
  name: string
  categoryCode: string | null
  isActive: boolean
  stockQty: number
  priceLabel?: string | null
}

export function InventoryTable({
  rows,
  categoryOptions,
  tableName,
  pkColumn,
  emptyMessage,
  activeLabel = "사용중",
  inactiveLabel = "사용중지",
}: {
  rows: InventoryRow[]
  categoryOptions: SelectOption[]
  tableName: string
  pkColumn: string
  emptyMessage: string
  activeLabel?: string
  inactiveLabel?: string
}) {
  const [category, setCategory] = useState("")

  const filteredRows = useMemo(
    () => (category ? rows.filter((r) => r.categoryCode === category) : rows),
    [rows, category],
  )

  const showPrice = rows.some((r) => r.priceLabel !== undefined)

  return (
    <div className="flex flex-col gap-3">
      <SearchableSelect
        className="w-56"
        value={category}
        onChange={setCategory}
        placeholder="전체 카테고리"
        searchPlaceholder="카테고리 검색..."
        options={[{ value: "", label: "전체 카테고리" }, ...categoryOptions]}
      />

      {filteredRows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
          <PackageSearch className="h-8 w-8" />
          <p className="text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">코드</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">이름</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">카테고리</th>
                {showPrice && (
                  <th className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">판매가</th>
                )}
                <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">상태</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">재고 수량</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.pkValue} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted-foreground">{row.code}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-foreground">{row.name}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{row.categoryCode ?? "-"}</td>
                  {showPrice && (
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-foreground">
                      {row.priceLabel ?? "-"}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-2">
                    <span
                      className={
                        row.isActive
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                          : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
                      }
                    >
                      {row.isActive ? activeLabel : inactiveLabel}
                    </span>
                    {row.stockQty <= LOW_STOCK_THRESHOLD && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        재고 부족
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <InventoryStockCell
                      tableName={tableName}
                      pkColumn={pkColumn}
                      pkValue={row.pkValue}
                      initialQty={row.stockQty}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
