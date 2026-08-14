"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export type AliasInput = { platform: string; rawName: string; skuId: string }

/**
 * 플랫폼 원문 메뉴명(raw_name) → SKU 매핑을 저장하고, 저장 즉시 기존에
 * sku_id가 비어 있던 tb_sales_order_item 행에도 같은 매핑을 소급 적용(백필)한다.
 */
export async function saveSkuPlatformAliases(
  rows: AliasInput[],
): Promise<{ error?: string; success?: boolean; backfilled?: number }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다." }
  if (rows.length === 0) return { error: "선택된 매핑이 없습니다." }

  const admin = createAdminClient()

  // (platform, raw_name) 조합의 기존 매핑을 지우고 다시 넣는다 — 재매핑 시에도 안전
  for (const r of rows) {
    await admin.from("tb_sku_platform_alias").delete().eq("platform", r.platform).eq("raw_name", r.rawName)
  }
  const { error: insertError } = await admin
    .from("tb_sku_platform_alias")
    .insert(rows.map((r) => ({ platform: r.platform, raw_name: r.rawName, sku_id: r.skuId })))
  if (insertError) return { error: insertError.message }

  // 백필: sku_id가 비어 있는 기존 주문 품목에 방금 저장한 매핑을 소급 반영
  let backfilled = 0
  const { data: unmapped } = await admin
    .from("tb_sales_order_item")
    .select("id, order_id, raw_name")
    .is("sku_id", null)

  if (unmapped && unmapped.length > 0) {
    const orderIds = [...new Set(unmapped.map((i) => i.order_id as string))]
    const { data: orders } = await admin.from("tb_sales_order").select("id, platform").in("id", orderIds)
    const platformByOrderId = new Map((orders ?? []).map((o) => [o.id as string, o.platform as string]))
    const skuIdByKey = new Map(rows.map((r) => [`${r.platform}::${r.rawName}`, r.skuId]))

    for (const item of unmapped) {
      const platform = platformByOrderId.get(item.order_id as string)
      if (!platform) continue
      const skuId = skuIdByKey.get(`${platform}::${item.raw_name as string}`)
      if (!skuId) continue
      const { error } = await admin.from("tb_sales_order_item").update({ sku_id: skuId }).eq("id", item.id as string)
      if (!error) backfilled++
    }
  }

  revalidatePath("/dashboard/sku-platform-mapping")
  revalidatePath("/dashboard/sales-analytics")
  return { success: true, backfilled }
}
