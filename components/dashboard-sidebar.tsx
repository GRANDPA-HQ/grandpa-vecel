"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Users, Database, Cog, Bug, BookText, ClipboardList, LayoutDashboard, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { SignOutButton } from "@/components/sign-out-button"

export function DashboardSidebar({
  isManager,
  userName,
}: {
  isManager: boolean
  userName: string
}) {
  const pathname = usePathname()
  const isDataTable = pathname.startsWith("/dashboard/data-table")

  const navItems = [
    { label: "홈", href: "/dashboard", icon: LayoutDashboard, visible: true, exact: true },
    { label: "직원 관리", href: "/dashboard/employees", icon: Users, visible: isManager },
    { label: "데이터 테이블", href: "/dashboard/data-table", icon: Database, visible: true },
    { label: "생산 공정", href: "/dashboard/production", icon: Cog, visible: true, exact: true },
    { label: "판매품 레시피 작성", href: "/dashboard/production-write", icon: ClipboardList, visible: true, exact: true },
    { label: "생산일지", href: "/dashboard/production-log", icon: FileText, visible: true },
    { label: "버그 리포트", href: "/dashboard/bug-report", icon: Bug, visible: true },
    { label: "레시피 가이드", href: "/dashboard/recipe-guide", icon: BookText, visible: true },
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
          .map(({ label, href, icon: Icon, exact }) => {
            const isActive = exact
              ? pathname === href
              : pathname.startsWith(href)
            return (
              <Link
                key={href}
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
            )
          })}

        {/* 데이터 테이블 서브메뉴 */}
        {isDataTable && (
          <div className="mt-1 border-t border-gray-800 py-3">
            <p className="px-5 pb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
              테이블 선택
            </p>
            {[
              { label: "원자재 테이블", table: "tb_raw_mst" },
              { label: "카테고리 테이블", table: "tb_category_mst" },
              { label: "생산품 테이블", table: "tb_prod_mst" },
              { label: "생산 공정 테이블", table: "tb_production_process" },
            ].map(({ label, table }) => {
              const isActive =
                pathname === `/dashboard/data-table/${encodeURIComponent(table)}`
              return (
                <Link
                  key={table}
                  href={`/dashboard/data-table/${encodeURIComponent(table)}`}
                  className={cn(
                    "flex items-center gap-2 border-l-2 py-2 pl-9 pr-5 text-sm transition-colors",
                    isActive
                      ? "border-emerald-500 bg-gray-800 font-medium text-white"
                      : "border-transparent text-gray-500 hover:bg-gray-800 hover:text-gray-300",
                  )}
                >
                  <span className="h-1 w-1 rounded-full bg-current opacity-60" />
                  {label}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* 하단: 사용자 + 로그아웃 */}
      <div className="border-t border-gray-800">
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-gray-300">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span className="truncate text-sm text-gray-300">{userName}</span>
        </div>
        <SignOutButton />
      </div>
    </aside>
  )
}
