import { Node, mergeAttributes } from "@tiptap/core"

/**
 * 판매 레시피 라이브 마커 노드.
 * 본문에는 `<div data-sku-recipe="{skuId}">` 자리표시자만 저장되고,
 * 가이드 목록 렌더링 시 서버에서 최신 레시피 구성으로 치환된다 (lib/recipe-embed.ts).
 * 에디터 안에서는 편집 불가능한 한 덩어리(atom) 칩으로 보인다.
 */
export const SkuRecipeEmbed = Node.create({
  name: "skuRecipeEmbed",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      skuId: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-sku-recipe") ?? "",
        renderHTML: (attrs: { skuId?: string }) => ({ "data-sku-recipe": attrs.skuId ?? "" }),
      },
      label: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-label") ?? "",
        renderHTML: (attrs: { label?: string }) => ({ "data-label": attrs.label ?? "" }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-sku-recipe]" }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "sku-recipe-embed" }),
      `📋 ${node.attrs.label || "판매 레시피"} — 게시 화면에서 최신 레시피 구성으로 표시됩니다`,
    ]
  },
})
