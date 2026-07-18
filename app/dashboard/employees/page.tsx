import { redirect } from "next/navigation"
import { getTableRows, getIdLabelOptions } from "@/lib/supabase/db"
import { getCurrentEmployee } from "@/lib/permissions"
import { EMPLOYEE_FK_LOOKUPS, sortOptionsByLabelOrder } from "@/lib/table-config"
import { EmployeeTable } from "@/components/employee-table"
import { InviteButton } from "@/components/invite-button"

export default async function EmployeesPage() {
  // 시니어 직급만 접근 가능
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  if (!employee.isSenior) redirect("/dashboard/bug-report")

  let employees: Record<string, unknown>[] = []
  let total: number | null = null
  let error: string | null = null
  const lookupOptions: Record<string, { value: string; label: string }[]> = {}

  try {
    const [employeesResult, ...lookups] = await Promise.all([
      getTableRows("employees", 1000, 0, { orderBy: "name", orderDir: "asc" }),
      ...EMPLOYEE_FK_LOOKUPS.map((l) =>
        getIdLabelOptions(l.table, l.labelColumn).catch(() => [] as { value: string; label: string }[]),
      ),
    ])
    employees = employeesResult.rows
    total = employeesResult.total
    EMPLOYEE_FK_LOOKUPS.forEach((l, i) => {
      lookupOptions[l.column] = sortOptionsByLabelOrder(lookups[i], l.labelOrder)
    })
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
        <EmployeeTable
          employees={employees}
          lookupOptions={lookupOptions}
          currentUserId={employee.id}
        />
      )}
    </div>
  )
}
