import { AlertTriangle, PackageSearch } from "lucide-react"
import { getSkuStockRows } from "@/lib/supabase/db"
import { InventoryStockCell } from "@/components/inventory-stock-cell"

const LOW_STOCK_THRESHOLD = 5

export default async function InventoryPage() {
  let rows: Awaited<ReturnType<typeof getSkuStockRows>> = null
  let loadError: string | null = null
  try {
    rows = await getSkuStockRows()
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
  }

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
              {rows.map((row) => (
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
