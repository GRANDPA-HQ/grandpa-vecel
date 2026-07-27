import Link from "next/link"
import { getTableCount } from "@/lib/supabase/db"
import { Tags, Package, PackageOpen, Factory, ClipboardList, Barcode, BookOpen } from "lucide-react"

// 구매(카테고리·원재료·부자재) → 생산(생산품·레시피) → 판매(판매품·레시피) 흐름 순서.
// 색상도 이 3단계 그룹별로 통일 (구매: 톤, 생산: 에메랄드, 판매: 블루) — 아이콘으로 개별 테이블을 구분한다.
const PURCHASE_STYLE = {
  color: "text-amber-600",
  bg: "bg-amber-50 hover:bg-amber-100 border-amber-100 hover:border-amber-300",
}
const PRODUCTION_STYLE = {
  color: "text-emerald-600",
  bg: "bg-emerald-50 hover:bg-emerald-100 border-emerald-100 hover:border-emerald-300",
}
const SALES_STYLE = {
  color: "text-blue-600",
  bg: "bg-blue-50 hover:bg-blue-100 border-blue-100 hover:border-blue-300",
}

const TABLES = [
  {
    label: "카테고리 테이블",
    table: "tb_category_mst",
    icon: Tags,
    description: "상품 카테고리 마스터 데이터를 조회합니다",
    ...PURCHASE_STYLE,
  },
  {
    label: "원재료 테이블",
    table: "tb_raw_mst",
    icon: Package,
    description: "원재료 마스터 데이터를 조회합니다",
    ...PURCHASE_STYLE,
  },
  {
    label: "포장 부자재 테이블",
    table: "tb_submat_mst",
    icon: PackageOpen,
    description: "포장 부자재 마스터 데이터를 조회합니다",
    ...PURCHASE_STYLE,
  },
  {
    label: "생산품 테이블",
    table: "tb_prod_mst",
    icon: Factory,
    description: "생산품 마스터 데이터를 조회합니다",
    ...PRODUCTION_STYLE,
  },
  {
    label: "생산품 레시피 테이블",
    table: "tb_prod_recipe",
    icon: ClipboardList,
    description: "생산품별 원재료 구성 레시피를 조회합니다",
    ...PRODUCTION_STYLE,
  },
  {
    label: "판매품 테이블",
    table: "tb_sku_mst",
    icon: Barcode,
    description: "판매품 마스터 데이터를 조회합니다",
    ...SALES_STYLE,
  },
  {
    label: "판매품 레시피 테이블",
    table: "tb_sku_recipe",
    icon: BookOpen,
    description: "판매품별 생산품 구성 레시피를 조회합니다",
    ...SALES_STYLE,
  },
] as const

export default async function DataTablePage() {
  const counts = await Promise.all(
    TABLES.map(async ({ table }) => {
      try {
        const count = await getTableCount(table)
        return { table, count }
      } catch {
        return { table, count: null }
      }
    }),
  )
  const countMap = new Map(counts.map((c) => [c.table, c.count]))

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">데이터 테이블</h1>
        <p className="mt-1 text-sm text-muted-foreground">조회할 테이블을 선택하세요</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {TABLES.map(({ label, table, icon: Icon, description, color, bg }) => {
          const count = countMap.get(table)
          return (
            <Link
              key={table}
              href={`/dashboard/data-table/${encodeURIComponent(table)}`}
              className={`flex flex-col gap-4 rounded-xl border p-6 transition-colors ${bg}`}
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-lg bg-white shadow-sm ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{label}</p>
                <p className="mt-0.5 text-sm text-gray-500">{description}</p>
              </div>
              <div className="mt-auto text-xs text-gray-400">
                {count !== null && count !== undefined ? (
                  <span>{count.toLocaleString()}개의 데이터</span>
                ) : (
                  <span>데이터 로드 중...</span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
