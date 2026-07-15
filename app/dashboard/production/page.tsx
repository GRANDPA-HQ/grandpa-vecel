import { redirect } from "next/navigation"

// 생산 공정 페이지는 생산품 레시피 작성으로 대체됨 — 이전 링크/즐겨찾기 호환용 리다이렉트
export default function ProductionPage() {
  redirect("/dashboard/prod-recipe-write")
}
