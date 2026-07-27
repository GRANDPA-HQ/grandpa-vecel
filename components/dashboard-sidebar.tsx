"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Users, Database, Bug, BookText, ClipboardList, LayoutDashboard, FileText, NotebookPen, TrendingUp, PackageSearch } from "lucide-react"
import { cn } from "@/lib/utils"
import { SignOutButton } from "@/components/sign-out-button"
import { ChangePasswordButton } from "@/components/change-password-button"

const DATA_TABLE_HREF = "/dashboard/data-table"

export function DashboardSidebar({
  isManager,
  userName,
}: {
  isManager: boolean
  userName: string
}) {
  const pathname = usePathname()

  // 각 메뉴 항목에 submenu(하위 메뉴)를 선택적으로 붙일 수 있는 구조.
  // submenu가 있고 현재 경로가 그 항목 하위이면, 해당 항목 바로 아래에 자동으로 펼쳐짐.
  // 나중에 다른 메뉴(예: 재고 관리)에 서브메뉴가 필요해지면,
  // 그 항목에도 동일하게 submenu 배열만 추가하면 됨 — 렌더링 위치는 자동 처리됨.
  const navItems = [
    { label: "홈", href: "/dashboard", icon: LayoutDashboard, visible: true, exact: true },
    { label: "직원 관리", href: "/dashboard/employees", icon: Users, visible: isManager },
    {
      label: "데이터 테이블",
      href: DATA_TABLE_HREF,
      icon: Database,
      visible: true,
      // 구매(카테고리·원재료·부자재) → 생산(생산품·레시피) → 판매(판매품·레시피) 흐름 순서
      submenu: [
        { label: "카테고리 테이블", table: "tb_category_mst" },
        { label: "원재료 테이블", table: "tb_raw_mst" },
        { label: "포장 부자재 테이블", table: "tb_submat_mst" },
        { label: "생산품 테이블", table: "tb_prod_mst" },
        { label: "생산품 레시피 테이블", table: "tb_prod_recipe" },
        { label: "판매품 테이블", table: "tb_sku_mst" },
        { label: "판매품 레시피 테이블", table: "tb_sku_recipe" },
      ].map(({ label, table }) => ({
        label,
        href: `${DATA_TABLE_HREF}/${encodeURIComponent(table)}`,
      })),
    },
    { label: "매출 분석", href: "/dashboard/sales-analytics", icon: TrendingUp, visible: true, exact: true },
    { label: "재고 관리", href: "/dashboard/inventory", icon: PackageSearch, visible: true, exact: true },
    { label: "생산품 레시피 작성", href: "/dashboard/prod-recipe-write", icon: NotebookPen, visible: true, exact: true },
    { label: "판매품 레시피 작성", href: "/dashboard/production-write", icon: ClipboardList, visible: true, exact: true },
    { label: "생산일지", href: "/dashboard/production-log", icon: FileText, visible: true },
    { label: "레시피 가이드", href: "/dashboard/recipe-guide", icon: BookText, visible: true },
    { label: "버그 리포트", href: "/dashboard/bug-report", icon: Bug, visible: true },
  ]

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-gray-900">
      {/* 브랜드 로고 */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 border-b border-gray-800 px-5 py-5"
      >
        <span className="text-lg font-extrabold tracking-tight text-emerald-400">Granpa-co</span>
      </Link>

      {/* 메인 네비게이션 */}
      <nav className="flex flex-1 flex-col overflow-y-auto py-3">
        <p className="px-5 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
          메뉴
        </p>

        {navItems
          .filter((item) => item.visible)
          .map(({ label, href, icon: Icon, exact, submenu }) => {
            const isActive = exact
              ? pathname === href
              : pathname.startsWith(href)
            const isWithinSection = pathname.startsWith(href)

            return (
              <div key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 border-l-2 px-5 py-2.5 text-sm transition-colors",
                    isActive
                      ? "border-emerald-500 bg-gray-800 font-medium text-white"
                      : "border-transparent text-gray-400 hover:bg-gray-800 hover:text-gray-200",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>

                {/* 서브메뉴: 이 항목 하위 경로에 있을 때만, 이 항목 바로 아래에 표시 */}
                {submenu && submenu.length > 0 && isWithinSection && (
                  <div className="bg-gray-950/40 py-1.5">
                    {submenu.map((sub) => {
                      const isSubActive = pathname === sub.href
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={cn(
                            "flex items-center gap-2 border-l-2 py-2 pl-9 pr-5 text-sm transition-colors",
                            isSubActive
                              ? "border-emerald-500 bg-gray-800 font-medium text-white"
                              : "border-transparent text-gray-500 hover:bg-gray-800 hover:text-gray-300",
                          )}
                        >
                          <span className="h-1 w-1 rounded-full bg-current opacity-60" />
                          {sub.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
      </nav>

      {/* 하단: 사용자 + 로그아웃 */}
      <div className="border-t border-gray-800">
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-gray-300">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span className="min-w-0 flex-1 truncate text-sm text-gray-300">{userName}</span>
          <ChangePasswordButton />
        </div>
        <SignOutButton />
      </div>
    </aside>
  )
}
