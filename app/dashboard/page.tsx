import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"
import {
  Users,
  Database,
  Cog,
  Bug,
  BookText,
  ClipboardList,
  ChevronRight,
} from "lucide-react"

const MENU_CARDS = [
  {
    href: "/dashboard/employees",
    icon: Users,
    label: "직원 관리",
    description: "직원 목록 조회 및 초대 관리",
    color: "bg-violet-50 border-violet-100",
    iconColor: "bg-violet-100 text-violet-600",
    managerOnly: true,
  },
  {
    href: "/dashboard/data-table",
    icon: Database,
    label: "데이터 테이블",
    description: "원재료 · 카테고리 · 생산품 데이터 조회",
    color: "bg-blue-50 border-blue-100",
    iconColor: "bg-blue-100 text-blue-600",
    managerOnly: false,
  },
  {
    href: "/dashboard/production",
    icon: Cog,
    label: "생산 공정",
    description: "생산 공정 현황 조회 및 관리",
    color: "bg-emerald-50 border-emerald-100",
    iconColor: "bg-emerald-100 text-emerald-600",
    managerOnly: false,
  },
  {
    href: "/dashboard/production-write",
    icon: ClipboardList,
    label: "판매품 레시피 작성",
    description: "판매품별 생산품 구성 레시피 등록 및 편집",
    color: "bg-teal-50 border-teal-100",
    iconColor: "bg-teal-100 text-teal-600",
    managerOnly: false,
  },
  {
    href: "/dashboard/recipe-guide",
    icon: BookText,
    label: "레시피 가이드",
    description: "조리 레시피 가이드 작성 및 조회",
    color: "bg-orange-50 border-orange-100",
    iconColor: "bg-orange-100 text-orange-600",
    managerOnly: false,
  },
  {
    href: "/dashboard/bug-report",
    icon: Bug,
    label: "버그 리포트",
    description: "시스템 오류 및 개선사항 보고",
    color: "bg-red-50 border-red-100",
    iconColor: "bg-red-100 text-red-600",
    managerOnly: false,
  },
] as const

export default async function DashboardPage() {
  const employee = await getCurrentEmployee()
  const userName = employee?.name ?? "사용자"
  const isManager = employee?.isSenior ?? false

  const admin = createAdminClient()

  // 통계 데이터
  const [bugResult, recipeResult, employeeResult] = await Promise.allSettled([
    admin.from("bug_reports").select("id", { count: "exact", head: true }),
    admin.from("recipe_guides").select("id", { count: "exact", head: true }),
    admin.from("employees").select("id", { count: "exact", head: true }),
  ])

  const bugCount =
    bugResult.status === "fulfilled" ? (bugResult.value.count ?? 0) : 0
  const recipeCount =
    recipeResult.status === "fulfilled" ? (recipeResult.value.count ?? 0) : 0
  const employeeCount =
    employeeResult.status === "fulfilled" ? (employeeResult.value.count ?? 0) : 0

  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })

  const visibleCards = MENU_CARDS.filter((c) => !c.managerOnly || isManager)

  return (
    <div className="flex flex-col gap-8">
      {/* 인사말 */}
      <div className="rounded-xl border border-border bg-gradient-to-r from-emerald-50 to-white p-6">
        <p className="text-sm text-gray-400">{today}</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          안녕하세요, <span className="text-emerald-600">{userName}</span>님 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Granpa-co 관리 시스템에 오신 것을 환영합니다.
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {isManager && (
          <div className="flex flex-col gap-1 rounded-xl border border-violet-100 bg-violet-50 p-5">
            <span className="text-xs font-medium text-violet-400">전체 직원</span>
            <span className="text-3xl font-bold text-violet-700">{employeeCount}</span>
            <span className="text-xs text-violet-400">명</span>
          </div>
        )}
        <div className="flex flex-col gap-1 rounded-xl border border-red-100 bg-red-50 p-5">
          <span className="text-xs font-medium text-red-400">버그 리포트</span>
          <span className="text-3xl font-bold text-red-700">{bugCount}</span>
          <span className="text-xs text-red-400">건</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-orange-100 bg-orange-50 p-5">
          <span className="text-xs font-medium text-orange-400">레시피 가이드</span>
          <span className="text-3xl font-bold text-orange-700">{recipeCount}</span>
          <span className="text-xs text-orange-400">건</span>
        </div>
      </div>

      {/* 메뉴 카드 */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-gray-500">바로가기</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCards.map(({ href, icon: Icon, label, description, color, iconColor }) => (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-4 rounded-xl border p-5 transition-all hover:shadow-md ${color}`}
            >
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{label}</p>
                <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{description}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
