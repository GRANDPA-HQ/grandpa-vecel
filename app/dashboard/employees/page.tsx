import { redirect } from "next/navigation"
import { getTableRows } from "@/lib/supabase/db"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { EmployeeTable } from "@/components/employee-table"
import { InviteButton } from "@/components/invite-button"

export default async function EmployeesPage() {
  // 점장만 접근 가능
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = createAdminClient()
  const { data: userData } = await admin
    .from("users")
    .select("positions(name_ko)")
    .eq("id", user.id)
    .single()

  const positionName = (userData?.positions as { name_ko: string } | null)?.name_ko ?? ""
  if (positionName !== "점장") redirect("/dashboard/bug-report")

  let users: Record<string, unknown>[] = []
  let positions: Record<string, unknown>[] = []
  let total: number | null = null
  let error: string | null = null

  try {
    const [usersResult, positionsResult] = await Promise.all([
      getTableRows("users", 1000, 0),
      getTableRows("positions", 1000, 0),
    ])
    users = usersResult.rows
    total = usersResult.total
    positions = positionsResult.rows
  } catch (e) {
    error = e instanceof Error ? e.message : "직원 정보를 불러오지 못했습니다."
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">직원 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total !== null ? `총 ${total}명의 직원` : "직원 목록"}
          </p>
        </div>
        <InviteButton />
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <EmployeeTable users={users} positions={positions} currentUserId={user.id} />
      )}
    </div>
  )
}
