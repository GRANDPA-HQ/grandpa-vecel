import Link from "next/link"
import { getTableCount } from "@/lib/supabase/db"
import { Package, Tag, Factory, Users, ClipboardList, Barcode, BookOpen } from "lucide-react"

const TABLES = [
  {
    label: "원자재 테이블",
    table: "tb_raw_mst",
    icon: Package,
    description: "원자재 마스터 데이터를 조회합니다",
    color: "text-orange-500",
    bg: "bg-orange-50 hover:bg-orange-100 border-orange-100 hover:border-orange-300",
  },
  {
    label: "카테고리 테이블",
    table: "tb_category_mst",
    icon: Tag,
    description: "카테고리 분류 데이터를 조회합니다",
    color: "text-blue-500",
    bg: "bg-blue-50 hover:bg-blue-100 border-blue-100 hover:border-blue-300",
  },
  {
    label: "생산품 테이블",
    table: "tb_prod_mst",
    icon: Factory,
    description: "생산품 마스터 데이터를 조회합니다",
    color: "text-emerald-500",
    bg: "bg-emerald-50 hover:bg-emerald-100 border-emerald-100 hover:border-emerald-300",
  },
  {
    label: "유저 테이블",
    table: "users",
    icon: Users,
    description: "사용자 계정 데이터를 조회합니다",
    color: "text-purple-500",
    bg: "bg-purple-50 hover:bg-purple-100 border-purple-100 hover:border-purple-300",
  },
  {
    label: "SKU 테이블",
    table: "tb_sku_mst",
    icon: Barcode,
    description: "SKU 마스터 데이터를 조회합니다",
    color: "text-indigo-500",
    bg: "bg-indigo-50 hover:bg-indigo-100 border-indigo-100 hover:border-indigo-300",
  },
  {
    label: "SKU 레시피 테이블",
    table: "tb_sku_recipe",
    icon: BookOpen,
    description: "SKU별 생산품 구성 레시피를 조회합니다",
    color: "text-rose-500",
    bg: "bg-rose-50 hover:bg-rose-100 border-rose-100 hover:border-rose-300",
  },
  {
    label: "생산 공정 테이블",
    table: "tb_production_process",
    icon: ClipboardList,
    description: "생산 공정 및 승인 현황을 조회합니다",
    color: "text-teal-500",
    bg: "bg-teal-50 hover:bg-teal-100 border-teal-100 hover:border-teal-300",
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
