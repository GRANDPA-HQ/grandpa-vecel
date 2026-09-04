"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Users,
  Database,
  Bug,
  BookText,
  ClipboardList,
  LayoutDashboard,
  NotebookPen,
  TrendingUp,
  Link2,
  Store,
  ChefHat,
  Wheat,
  Archive,
  Factory,
  ShoppingBag,
  BookOpen,
  Megaphone,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SignOutButton } from "@/components/sign-out-button"
import { ChangePasswordButton } from "@/components/change-password-button"

const DATA_TABLE_HREF = "/dashboard/data-table"

type NavGroup = { kind: "group"; label: string }
type NavLeaf = {
  kind: "leaf"
  label: string
  href: string
  icon: LucideIcon
  visible?: boolean
  exact?: boolean
  submenu?: { label: string; href: string }[]
}
// 아직 화면/기능이 준비되지 않은 메뉴 — 클릭 불가능한 상태로 "준비중" 표시만 한다
type NavPlaceholder = { kind: "placeholder"; label: string; icon: LucideIcon; visible?: boolean }
type NavEntry = NavGroup | NavLeaf | NavPlaceholder

export function DashboardSidebar({
  isManager,
  userName,
}: {
  isManager: boolean
  userName: string
}) {
  const pathname = usePathname()

  // 각 leaf 항목에 submenu(하위 메뉴)를 선택적으로 붙일 수 있는 구조.
  // submenu가 있고 현재 경로가 그 항목 하위이면, 해당 항목 바로 아래에 자동으로 펼쳐짐.
  // group 항목은 클릭 불가능한 섹션 구분 라벨이며, 그 뒤로 이어지는 leaf/placeholder들을 묶어 보여준다.
  const navItems: NavEntry[] = [
    { kind: "leaf", label: "홈", href: "/dashboard", icon: LayoutDashboard, visible: true, exact: true },

    { kind: "group", label: "출퇴근" },
    { kind: "leaf", label: "공지 게시판", href: "/dashboard/attendance/notices", icon: Megaphone, visible: true, exact: true },

    { kind: "group", label: "운영/생산 일지" },
    { kind: "leaf", label: "SP 운영일지", href: "/dashboard/operation-log", icon: Store, visible: true, exact: true },
    { kind: "leaf", label: "KP 생산일지", href: "/dashboard/production-log", icon: ChefHat, visible: true },

    { kind: "group", label: "재고관리" },
    { kind: "leaf", label: "원재료", href: "/dashboard/inventory-raw", icon: Wheat, visible: true, exact: true },
    { kind: "leaf", label: "포장부자재", href: "/dashboard/inventory-submat", icon: Archive, visible: true, exact: true },
    { kind: "leaf", label: "생산품", href: "/dashboard/inventory-prod", icon: Factory, visible: true, exact: true },
    { kind: "leaf", label: "판매품", href: "/dashboard/inventory", icon: ShoppingBag, visible: true, exact: true },

    { kind: "leaf", label: "SOP(방법서) 관리", href: `${DATA_TABLE_HREF}/tb_sop_mst`, icon: BookOpen, visible: true, exact: true },

    { kind: "group", label: "매출관리" },
    { kind: "leaf", label: "매출 대시보드", href: "/dashboard/sales-analytics", icon: TrendingUp, visible: true, exact: true },
    { kind: "leaf", label: "판매품명 맵핑", href: "/dashboard/sku-platform-mapping", icon: Link2, visible: true, exact: true },

    {
      kind: "leaf",
      label: "마스터 DB 관리",
      href: DATA_TABLE_HREF,
      icon: Database,
      visible: true,
      // 판매(판매품·레시피) → 생산(생산품·레시피) → 구매(원재료·부자재·카테고리) → 자산/지점 흐름 순서
      submenu: [
        { label: "판매품 테이블", table: "tb_sku_mst" },
        { label: "판매품 레시피 테이블", table: "tb_sku_recipe" },
        { label: "생산품 테이블", table: "tb_prod_mst" },
        { label: "생산품 레시피 테이블", table: "tb_prod_recipe" },
        { label: "원재료 테이블", table: "tb_raw_mst" },
        { label: "포장 부자재 테이블", table: "tb_submat_mst" },
        { label: "카테고리 테이블", table: "tb_category_mst" },
        { label: "장비/집기/시설 테이블", table: "tb_asset_mst" },
        { label: "존(ZONE) 관리", table: "tb_zone_mst" },
        { label: "지점관리", table: "tb_store_mst" },
      ].map(({ label, table }) => ({
        label,
        href: `${DATA_TABLE_HREF}/${encodeURIComponent(table)}`,
      })),
    },

    { kind: "leaf", label: "생산품 레시피 작성", href: "/dashboard/prod-recipe-write", icon: NotebookPen, visible: true, exact: true },
    { kind: "leaf", label: "판매품 레시피 작성", href: "/dashboard/production-write", icon: ClipboardList, visible: true, exact: true },
    { kind: "leaf", label: "레시피 가이드", href: "/dashboard/recipe-guide", icon: BookText, visible: true },

    {
      kind: "leaf",
      label: "직원 관리",
      href: "/dashboard/employees",
      icon: Users,
      visible: isManager,
      submenu: [{ label: "PIN 발급 관리", href: "/dashboard/employees/pin" }],
    },
    { kind: "leaf", label: "버그 리포트", href: "/dashboard/bug-report", icon: Bug, visible: true },
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
          .filter((entry) => entry.kind === "group" || entry.visible)
          .map((entry, i) => {
            // 섹션 구분 라벨 — 클릭 불가, 이후 항목들을 그룹으로 묶어 보여주는 용도
            if (entry.kind === "group") {
              return (
                <p
                  key={`group-${entry.label}-${i}`}
                  className="px-5 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-widest text-gray-600"
                >
                  {entry.label}
                </p>
              )
            }

            const Icon = entry.icon

            // 아직 준비되지 않은 메뉴 — 클릭 불가능한 상태로 "준비중" 배지만 표시
            if (entry.kind === "placeholder") {
              return (
                <div
                  key={`placeholder-${entry.label}`}
                  title="아직 준비되지 않았습니다"
                  className="flex cursor-not-allowed items-center gap-3 border-l-2 border-transparent px-5 py-2.5 text-sm text-gray-600"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{entry.label}</span>
                  <span className="rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                    준비중
                  </span>
                </div>
              )
            }

            const { label, href, exact, submenu } = entry
            const isActive = exact ? pathname === href : pathname.startsWith(href)
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
