import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { RecipeGuideList } from "@/components/recipe-guide-list"
import type { SkuRecipeSummary } from "@/components/recipe-guide-composer"

type RecipeGuide = {
  id: string
  title: string
  category: string | null
  content: string
  created_at: string
  author: { name: string } | null
}

export default async function RecipeGuidePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()

  const { data: userData } = await admin
    .from("users")
    .select("name")
    .eq("id", user?.id ?? "")
    .maybeSingle()

  const authorName = userData?.name ?? "알 수 없음"

  let guides: RecipeGuide[] = []
  let error: string | null = null

  try {
    const { data, error: fetchError } = await admin
      .from("recipe_guides")
      .select("id, title, category, content, created_at, author:users(name)")
      .order("created_at", { ascending: false })

    if (fetchError) throw fetchError
    guides = (data ?? []) as RecipeGuide[]
  } catch (e) {
    error = e instanceof Error ? e.message : "레시피 가이드 목록을 불러오지 못했습니다."
  }

  // 판매 레시피(SKU별 생산품 구성) — 작성 모달 드롭다운에서 본문 삽입용
  let skuRecipes: SkuRecipeSummary[] = []
  try {
    const [skuRes, prodRes] = await Promise.all([
      admin.from("tb_sku_mst").select("id,sku_code,sku_name").order("sku_code"),
      admin.from("tb_prod_mst").select("id,prod_code,prod_name"),
    ])

    // 작성 화면에서 드래그로 정한 행 순서(sort_order)대로 본문에 삽입되도록 정렬 조회
    let recipeRes = await admin
      .from("tb_sku_recipe")
      .select("sku_id,prod_id,amount,unit,memo")
      .order("sort_order")
    if (recipeRes.error) {
      recipeRes = await admin.from("tb_sku_recipe").select("sku_id,prod_id,amount,unit,memo")
    }

    const prodLabels = new Map(
      (prodRes.data ?? []).map((p) => [
        p.id as string,
        [p.prod_code, p.prod_name].filter(Boolean).join(" · "),
      ]),
    )

    const rowsBySku = new Map<string, SkuRecipeSummary["rows"]>()
    for (const r of recipeRes.data ?? []) {
      const rows = rowsBySku.get(r.sku_id as string) ?? []
      rows.push({
        prodLabel: prodLabels.get(r.prod_id as string) ?? "(알 수 없는 생산품)",
        amount: Number(r.amount),
        unit: String(r.unit ?? ""),
        memo: (r.memo as string | null) ?? null,
      })
      rowsBySku.set(r.sku_id as string, rows)
    }

    skuRecipes = (skuRes.data ?? [])
      .filter((s) => rowsBySku.has(s.id as string))
      .map((s) => ({
        skuId: s.id as string,
        label: [s.sku_code, s.sku_name].filter(Boolean).join(" · "),
        rows: rowsBySku.get(s.id as string)!,
      }))
  } catch {
    // 판매 레시피 조회 실패 시 드롭다운만 숨김 (가이드 목록은 정상 표시)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">레시피 가이드</h1>
        <p className="mt-1 text-sm text-muted-foreground">총 {guides.length}건의 가이드</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <RecipeGuideList guides={guides} authorName={authorName} skuRecipes={skuRecipes} />
      )}
    </div>
  )
}
