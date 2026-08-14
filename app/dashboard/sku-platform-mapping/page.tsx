import { createAdminClient } from "@/lib/supabase/admin"
import { getSkuOptions } from "@/lib/supabase/db"
import { SkuPlatformMappingForm, type MappingRow } from "@/components/sku-platform-mapping-form"

const PLATFORM_LABEL: Record<string, string> = {
  coupang_eats: "쿠팡이츠",
  baemin: "배민",
  coupang_pos: "홀(POS)",
}

function looksTruncated(rawName: string): boolean {
  const openCount = (rawName.match(/\(/g) ?? []).length
  const closeCount = (rawName.match(/\)/g) ?? []).length
  return openCount !== closeCount
}

export default async function SkuPlatformMappingPage() {
  const admin = createAdminClient()

  const [itemsRes, ordersRes, aliasRes, skuOptions] = await Promise.all([
    admin.from("tb_sales_order_item").select("raw_name, order_id, sku_id"),
    admin.from("tb_sales_order").select("id, platform"),
    admin.from("tb_sku_platform_alias").select("platform, raw_name, sku_id"),
    getSkuOptions(),
  ])

  const items = itemsRes.data ?? []
  const orders = ordersRes.data ?? []
  const aliases = aliasRes.data ?? []

  const platformByOrderId = new Map(orders.map((o) => [o.id as string, o.platform as string]))
  const existingSkuIdByKey = new Map(
    aliases.map((a) => [`${a.platform as string}::${a.raw_name as string}`, a.sku_id as string]),
  )

  const rowByKey = new Map<string, MappingRow>()
  for (const item of items) {
    const platform = platformByOrderId.get(item.order_id as string)
    if (!platform) continue
    const rawName = item.raw_name as string
    const key = `${platform}::${rawName}`
    const cur =
      rowByKey.get(key) ??
      ({
        platform,
        rawName,
        count: 0,
        existingSkuId: existingSkuIdByKey.get(key) ?? null,
        looksTruncated: looksTruncated(rawName),
      } satisfies MappingRow)
    cur.count += 1
    rowByKey.set(key, cur)
  }

  const rows = [...rowByKey.values()].sort((a, b) => {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform)
    return b.count - a.count
  })

  const unmappedCount = rows.filter((r) => !r.existingSkuId).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">메뉴 SKU 매핑</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          플랫폼 주문에 찍히는 원문 메뉴명을 판매품(SKU)에 연결합니다. 저장하면 이미 들어와 있는 주문 품목에도 바로
          소급 반영됩니다.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          매핑할 주문 품목이 없습니다.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-sm">
            <span>
              전체 <b>{rows.length}</b>종
            </span>
            <span className="text-amber-600">
              미매핑 <b>{unmappedCount}</b>종
            </span>
          </div>
          <SkuPlatformMappingForm rows={rows} skuOptions={skuOptions} platformLabel={PLATFORM_LABEL} />
        </>
      )}
    </div>
  )
}
