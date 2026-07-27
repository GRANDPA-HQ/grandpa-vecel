import Link from "next/link"
import { getTableCount } from "@/lib/supabase/db"
import { Tags, Package, PackageOpen, Factory, ClipboardList, Barcode, BookOpen, type LucideIcon } from "lucide-react"

// 카테고리는 전체 마스터의 분류 기준이 되는 독립적인 테이블이라 별도 톤(슬레이트)을 쓴다.
// 나머지는 구매 → 생산 → 판매 3단계 그룹별로 같은 계열 색을 쓰되,
// 그룹 안에서도 카드가 구분되도록 명도를 다르게 준다.
const CATEGORY_STYLE = {
  color: "text-slate-600",
  bg: "bg-slate-50 hover:bg-slate-100 border-slate-200",
}
const PURCHASE_STYLE_1 = {
  color: "text-amber-600",
  bg: "bg-amber-50 hover:bg-amber-100 border-amber-200",
}
const PURCHASE_STYLE_2 = {
  color: "text-amber-800",
  bg: "bg-amber-50 hover:bg-amber-100 border-amber-200",
}
const PRODUCTION_STYLE_1 = {
  color: "text-emerald-600",
  bg: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200",
}
const PRODUCTION_STYLE_2 = {
  color: "text-emerald-800",
  bg: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200",
}
const SALES_STYLE_1 = {
  color: "text-blue-600",
  bg: "bg-blue-50 hover:bg-blue-100 border-blue-200",
}
const SALES_STYLE_2 = {
  color: "text-blue-800",
  bg: "bg-blue-50 hover:bg-blue-100 border-blue-200",
}

type TableCard = {
  label: string
  table: string
  icon: LucideIcon
  description: string
  color: string
  bg: string
}

// 그룹별로 섹션을 나눠서, 화면 너비가 바뀌어도 같은 그룹의 카드끼리는 항상 같은 줄에 붙어있게 한다.
// (하나의 큰 그리드에 다 넣으면 줄바꿈 위치가 그룹 경계와 어긋나 예: 생산품/생산품 레시피가 다른 줄로 떨어질 수 있음)
const GROUPS: { name: string; tables: TableCard[] }[] = [
  {
    name: "분류",
    tables: [
      {
        label: "카테고리",
        table: "tb_category_mst",
        icon: Tags,
        description: "상품 카테고리 마스터 데이터를 조회합니다",
        ...CATEGORY_STYLE,
      },
    ],
  },
  {
    name: "구매",
    tables: [
      {
        label: "원재료",
        table: "tb_raw_mst",
        icon: Package,
        description: "원재료 마스터 데이터를 조회합니다",
        ...PURCHASE_STYLE_1,
      },
      {
        label: "포장 부자재",
        table: "tb_submat_mst",
        icon: PackageOpen,
        description: "포장 부자재 마스터 데이터를 조회합니다",
        ...PURCHASE_STYLE_2,
      },
    ],
  },
  {
    name: "생산",
    tables: [
      {
        label: "생산품",
        table: "tb_prod_mst",
        icon: Factory,
        description: "생산품 마스터 데이터를 조회합니다",
        ...PRODUCTION_STYLE_1,
      },
      {
        label: "생산품 레시피",
        table: "tb_prod_recipe",
        icon: ClipboardList,
        description: "생산품별 원재료 구성 레시피를 조회합니다",
        ...PRODUCTION_STYLE_2,
      },
    ],
  },
  {
    name: "판매",
    tables: [
      {
        label: "판매품",
        table: "tb_sku_mst",
        icon: Barcode,
        description: "판매품 마스터 데이터를 조회합니다",
        ...SALES_STYLE_1,
      },
      {
        label: "판매품 레시피",
        table: "tb_sku_recipe",
        icon: BookOpen,
        description: "판매품별 생산품 구성 레시피를 조회합니다",
        ...SALES_STYLE_2,
      },
    ],
  },
]

export default async function DataTablePage() {
  const allTables = GROUPS.flatMap((g) => g.tables)
  const counts = await Promise.all(
    allTables.map(async ({ table }) => {
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

      <div className="flex flex-col gap-6">
        {GROUPS.map((group) => (
          <div key={group.name} className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {group.name}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {group.tables.map(({ label, table, icon: Icon, description, color, bg }) => {
                const count = countMap.get(table)
                return (
                  <Link
                    key={table}
                    href={`/dashboard/data-table/${encodeURIComponent(table)}`}
                    className={`flex flex-col gap-2 rounded-xl border p-4 transition-colors ${bg}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ${color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <p className="truncate font-semibold text-gray-900">{label}</p>
                      </div>
                      <span className="shrink-0 text-xs text-gray-400">
                        {count !== null && count !== undefined ? `${count.toLocaleString()}개` : "…"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{description}</p>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
