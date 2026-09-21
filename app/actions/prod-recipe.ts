"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

type RecipeInput = {
  // 구성 재료가 원재료(tb_raw_mst)인지 다른 생산품(tb_prod_mst)인지 — 예: 요거트랜치믹스를
  // 만들어두고 그걸 재료로 요거트랜치드레싱을 만드는 경우 "prod"를 사용한다
  ingredientType: "raw" | "prod"
  ingredientId: string
  amount: number
  unit: string
  memo: string
}

export type RecipeHeaderInput = {
  stdBatchQty: number | null
  yieldRate: number | null
  stdLaborMin: number | null
}

type NormalizedLine = { inputType: "RAW" | "PROD"; refId: string; qty: number; unit: string; memo: string }

function normalizeRows(rows: RecipeInput[]): NormalizedLine[] {
  return rows.map((r) => ({
    inputType: r.ingredientType === "prod" ? "PROD" : "RAW",
    refId: r.ingredientId,
    qty: r.amount,
    unit: r.unit,
    memo: r.memo || "",
  }))
}

function sameRecipe(a: { header: RecipeHeaderInput; lines: NormalizedLine[] }, b: { header: RecipeHeaderInput; lines: NormalizedLine[] }): boolean {
  if (a.header.stdBatchQty !== b.header.stdBatchQty) return false
  if (a.header.yieldRate !== b.header.yieldRate) return false
  if (a.header.stdLaborMin !== b.header.stdLaborMin) return false
  if (a.lines.length !== b.lines.length) return false
  return a.lines.every((line, i) => {
    const other = b.lines[i]
    return (
      line.inputType === other.inputType &&
      line.refId === other.refId &&
      line.qty === other.qty &&
      line.unit === other.unit &&
      line.memo === other.memo
    )
  })
}

/**
 * 생산품 레시피 저장 — tb_prod_recipe_h(버전)+tb_prod_recipe_i(투입 라인) 구조.
 * 화면의 "전체 저장" UX는 통째로 다시 쓰는 것처럼 보이지만, 내부적으로는 버전 이력을 남긴다:
 * 헤더·투입 라인이 기존 활성 버전과 완전히 같으면 새 버전을 만들지 않고, 다르면 기존 활성
 * 버전을 is_active=false로 내리고 새 버전(version+1)을 insert한다(생산 로그가 "그 시점에
 * 적용된 레시피"를 recipe_h_id로 정확히 가리킬 수 있도록).
 */
export async function saveProdRecipe(
  prodId: string,
  rows: RecipeInput[],
  header: RecipeHeaderInput,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다." }

  if (rows.some((r) => r.ingredientType === "prod" && r.ingredientId === prodId)) {
    return { error: "생산품은 자기 자신을 재료로 사용할 수 없습니다." }
  }

  const admin = createAdminClient()

  const { data: activeH, error: activeError } = await admin
    .from("tb_prod_recipe_h")
    .select("recipe_h_id, version, std_batch_qty, yield_rate, std_labor_min")
    .eq("prod_id", prodId)
    .eq("is_active", true)
    .maybeSingle()
  if (activeError) return { error: activeError.message }

  const newLines = normalizeRows(rows)

  if (activeH) {
    const { data: existingLines, error: linesError } = await admin
      .from("tb_prod_recipe_i")
      .select("input_type, raw_id, prod_id, input_qty, input_unit, memo")
      .eq("recipe_h_id", activeH.recipe_h_id)
      .order("created_at", { ascending: true })
    if (linesError) return { error: linesError.message }

    const currentLines: NormalizedLine[] = (existingLines ?? []).map((l) => ({
      inputType: l.input_type as "RAW" | "PROD",
      refId: (l.input_type === "PROD" ? l.prod_id : l.raw_id) as string,
      qty: l.input_qty as number,
      unit: l.input_unit as string,
      memo: (l.memo as string | null) ?? "",
    }))

    const unchanged = sameRecipe(
      { header, lines: newLines },
      {
        header: { stdBatchQty: activeH.std_batch_qty, yieldRate: activeH.yield_rate, stdLaborMin: activeH.std_labor_min },
        lines: currentLines,
      },
    )
    if (unchanged) {
      revalidatePath("/dashboard/prod-recipe-write")
      revalidatePath("/dashboard/production-write")
      return { success: true }
    }
  }

  const { data: maxVersionRow } = await admin
    .from("tb_prod_recipe_h")
    .select("version")
    .eq("prod_id", prodId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = ((maxVersionRow?.version as number | undefined) ?? 0) + 1

  if (activeH) {
    const { error: deactivateError } = await admin
      .from("tb_prod_recipe_h")
      .update({ is_active: false })
      .eq("recipe_h_id", activeH.recipe_h_id)
    if (deactivateError) return { error: deactivateError.message }
  }

  const { data: newH, error: insertHError } = await admin
    .from("tb_prod_recipe_h")
    .insert({
      prod_id: prodId,
      version: nextVersion,
      is_active: true,
      std_batch_qty: header.stdBatchQty,
      yield_rate: header.yieldRate,
      std_labor_min: header.stdLaborMin,
    })
    .select("recipe_h_id")
    .single()
  if (insertHError) return { error: insertHError.message }

  // 표시 순서(created_at 기준) 보존을 위해 한 행씩 순차 insert한다(일괄 insert는 같은
  // 트랜잭션 타임스탬프를 공유해 순서가 무너질 수 있음 — 설계서가 sort_order 없이
  // created_at을 표시 순서로 쓰기로 했으므로 순서 보존이 중요하다).
  for (const line of newLines) {
    const { error: insertLineError } = await admin.from("tb_prod_recipe_i").insert({
      recipe_h_id: newH.recipe_h_id,
      input_type: line.inputType,
      raw_id: line.inputType === "RAW" ? line.refId : null,
      prod_id: line.inputType === "PROD" ? line.refId : null,
      input_qty: line.qty,
      input_unit: line.unit,
      memo: line.memo || null,
    })
    if (insertLineError) return { error: insertLineError.message }
  }

  revalidatePath("/dashboard/prod-recipe-write")
  revalidatePath("/dashboard/data-table/tb_prod_recipe_h")
  revalidatePath("/dashboard/production-write")
  return { success: true }
}
