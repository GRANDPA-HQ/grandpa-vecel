"use client"

import { useMemo, useState } from "react"
import { PackageSearch } from "lucide-react"
import { SearchableSelect } from "@/components/searchable-select"
import { InventoryStockCell } from "@/components/inventory-stock-cell"
import type { SkuStockRow } from "@/lib/supabase/db"
import type { SelectOption } from "@/lib/table-config"

const LOW_STOCK_THRESHOLD = 5

export function InventoryTable({
  rows,
  categoryOptions,
}: {
  rows: SkuStockRow[]
  categoryOptions: SelectOption[]
}) {
  const [category, setCategory] = useState("")

  const filteredRows = useMemo(
    () => (category ? rows.filter((r) => r.category_code === category) : rows),
    [rows, category],
  )

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
          <p className="text-sm">해당 카테고리의 판매품이 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">코드</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">이름</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">카테고리</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">판매가</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">상태</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">재고 수량</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted-foreground">{row.sku_code}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-foreground">{row.sku_name}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{row.category_code ?? "-"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-foreground">
                    {row.sell_price != null ? `${row.sell_price.toLocaleString("ko-KR")}원` : "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <span
                      className={
                        row.is_active
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                          : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
                      }
                    >
                      {row.is_active ? "판매중" : "판매중지"}
                    </span>
                    {row.stock_qty <= LOW_STOCK_THRESHOLD && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        재고 부족
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <InventoryStockCell skuId={row.id} initialQty={row.stock_qty} />
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
