import { redirect } from "next/navigation"
import { getCurrentEmployee } from "@/lib/permissions"
import { listSpEligibleEmployees } from "@/app/actions/attendance"
import { StaffManageTable } from "@/components/attendance/staff-manage-table"

export default async function EmployeesPinPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  if (!employee.isSenior) redirect("/dashboard/bug-report")

  const result = await listSpEligibleEmployees()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">PIN 발급 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          출퇴근 PIN 체크인 키오스크에서 쓸 PIN을 SP 파트 직원에게 발급/재발급합니다.
        </p>
      </div>

      {"error" in result ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {result.error}
        </div>
      ) : (
        <StaffManageTable initialStaff={result.staff} />
      )}
    </div>
  )
}
