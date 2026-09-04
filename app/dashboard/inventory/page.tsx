import { AlertTriangle, PackageSearch } from "lucide-react"
import { getSkuStockRows, getCategoryOptions } from "@/lib/supabase/db"
import { InventoryTable, type InventoryRow } from "@/components/inventory-table"
import type { SelectOption } from "@/lib/table-config"

export default async function InventoryPage() {
  let rows: Awaited<ReturnType<typeof getSkuStockRows>> = null
  let loadError: string | null = null
  try {
    rows = await getSkuStockRows()
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
  }
  const categoryOptions: SelectOption[] = await getCategoryOptions("SKU").catch(() => [])

  const inventoryRows: InventoryRow[] = (rows ?? []).map((r) => ({
    pkValue: r.id,
    code: r.sku_code,
    name: r.sku_name,
    categoryCode: r.category_code,
    isActive: r.is_active,
    stockQty: r.stock_qty,
    priceLabel: r.sell_price != null ? `${r.sell_price.toLocaleString("ko-KR")}원` : null,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">재고 관리</h1>
        <p className="text-sm text-muted-foreground">
          판매품(SKU)별 현재 재고 수량을 확인하고 수정합니다
        </p>
      </div>

      {loadError || rows === null ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">재고 데이터를 불러올 수 없습니다</p>
            <p className="mt-1 text-amber-700">
              tb_sku_mst 테이블에 stock_qty 컬럼이 아직 없을 수 있습니다. 마이그레이션(DDL)을 먼저 실행했는지
              확인해주세요.
              {loadError ? ` (${loadError})` : ""}
            </p>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
          <PackageSearch className="h-8 w-8" />
          <p className="text-sm">등록된 판매품(SKU)이 없습니다.</p>
        </div>
      ) : (
        <InventoryTable
          rows={inventoryRows}
          categoryOptions={categoryOptions}
          tableName="tb_sku_mst"
          pkColumn="id"
          emptyMessage="해당 카테고리의 판매품이 없습니다."
          activeLabel="판매중"
          inactiveLabel="판매중지"
        />
      )}
    </div>
  )
}
