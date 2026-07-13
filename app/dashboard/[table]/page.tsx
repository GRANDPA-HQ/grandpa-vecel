import { redirect } from "next/navigation"

// 구버전 테이블 뷰어 경로 — 커서 페이지네이션이 적용된 데이터 테이블 뷰어로 통합
export default async function TablePage({
  params,
}: {
  params: Promise<{ table: string }>
}) {
  const { table } = await params
  redirect(`/dashboard/data-table/${encodeURIComponent(decodeURIComponent(table))}`)
}
