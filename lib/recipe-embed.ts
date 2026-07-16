import type { SkuRecipeSummary } from "@/components/recipe-guide-composer"

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * 가이드 본문의 레시피 라이브 마커(div[data-sku-recipe])를
 * 조회 시점의 최신 레시피 구성 HTML로 치환한다.
 * 레시피가 수정되면 가이드를 다시 열 때 자동으로 최신 내용이 보인다.
 */
export function renderRecipeEmbeds(
  content: string,
  recipesBySkuId: Map<string, SkuRecipeSummary>,
): string {
  return content.replace(
    /<div[^>]*data-sku-recipe="[^"]*"[^>]*>[\s\S]*?<\/div>/g,
    (match) => {
      // 속성 순서가 바뀌어도 동작하도록 매칭된 블록에서 개별 추출
      const skuId = match.match(/data-sku-recipe="([^"]*)"/)?.[1] ?? ""
      const label = match.match(/data-label="([^"]*)"/)?.[1] ?? ""
      const recipe = recipesBySkuId.get(skuId)
      if (!recipe) {
        return `<p><em>(레시피 ${label ? `'${label}' ` : ""}구성을 찾을 수 없습니다 — 삭제되었거나 비어 있습니다)</em></p>`
      }
      const items = recipe.rows
        .map((r) => {
          const memo = r.memo ? ` <em>(${escapeHtml(r.memo)})</em>` : ""
          return `<li><p>${escapeHtml(r.prodLabel)} — <strong>${r.amount}${escapeHtml(r.unit)}</strong>${memo}</p></li>`
        })
        .join("")
      return `<h3>${escapeHtml(recipe.label)}</h3><ol>${items}</ol><p><em>※ 조회 시점의 최신 레시피 구성으로 자동 표시됩니다</em></p>`
    },
  )
}
