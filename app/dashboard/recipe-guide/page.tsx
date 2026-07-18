import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"
import { RecipeGuideList } from "@/components/recipe-guide-list"
import type { SkuRecipeSummary } from "@/components/recipe-guide-composer"
import { renderRecipeEmbeds } from "@/lib/recipe-embed"

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

  // 삭제 버튼은 점장(시니어 직급)에게만 표시
  const employee = await getCurrentEmployee()
  const canDelete = employee?.isSenior ?? false

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

  // 분류 목록 (recipe_guide_categories 테이블) — 테이블이 아직 없으면 null로
  // 두고 기존 방식(기본값 + 가이드에서 쓰인 분류)으로 동작한다
  let managedCategories: { id: string; name: string }[] | null = null
  {
    const { data, error: catError } = await admin
      .from("recipe_guide_categories")
      .select("id,name")
      .order("name")
    if (!catError) {
      managedCategories = (data ?? []).map((c) => ({ id: String(c.id), name: String(c.name) }))
    }
  }

  // 본문의 레시피 라이브 마커를 조회 시점의 최신 구성으로 치환 (표시용)
  // 원본 content는 수정 모달에서 마커 상태 그대로 편집되도록 유지한다
  const recipesBySkuId = new Map(skuRecipes.map((r) => [r.skuId, r]))
  const guidesForDisplay = guides.map((g) => ({
    ...g,
    displayContent: renderRecipeEmbeds(g.content, recipesBySkuId),
  }))

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
        <RecipeGuideList
          guides={guidesForDisplay}
          authorName={authorName}
          skuRecipes={skuRecipes}
          managedCategories={managedCategories}
          canDelete={canDelete}
        />
      )}
    </div>
  )
}
