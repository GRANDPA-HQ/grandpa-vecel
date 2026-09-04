import { redirect } from "next/navigation"
import { getTableRows, getIdLabelOptions, getColumnPrefs, getPartOptionsWithCode, getStoreScopeMap } from "@/lib/supabase/db"
import { getCurrentEmployee } from "@/lib/permissions"
import { EMPLOYEE_FK_LOOKUPS, EMPLOYEE_COLUMNS, sortOptionsByLabelOrder } from "@/lib/table-config"
import { EmployeeTable } from "@/components/employee-table"
import { EmployeeFilters } from "@/components/employee-filters"
import { ColumnSettingsMenu } from "@/components/column-settings-menu"
import { InviteButton } from "@/components/invite-button"

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; part?: string }>
}) {
  // 시니어 직급만 접근 가능
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")
  if (!employee.isSenior) redirect("/dashboard/bug-report")

  const { store, part } = await searchParams
  const storeValue = store?.trim() ?? ""
  const partValue = part?.trim() ?? ""

  let employees: Record<string, unknown>[] = []
  let total: number | null = null
  let error: string | null = null
  const lookupOptions: Record<string, { value: string; label: string }[]> = {}
  let partOptions: { value: string; label: string; code: string }[] = []
  let storeScopeMap: Record<string, string> = {}

  try {
    const [employeesResult, lookupResults, partOptionsResult, storeScopeResult] = await Promise.all([
      getTableRows("employees", 1000, 0, {
        orderBy: "name",
        orderDir: "asc",
        filters: [
          ...(storeValue ? [{ column: "store_id", value: storeValue }] : []),
          ...(partValue ? [{ column: "part_id", value: partValue }] : []),
        ],
      }),
      Promise.all(
        EMPLOYEE_FK_LOOKUPS.map((l) =>
          getIdLabelOptions(l.table, l.labelColumn).catch(() => [] as { value: string; label: string }[]),
        ),
      ),
      getPartOptionsWithCode().catch(() => [] as { value: string; label: string; code: string }[]),
      getStoreScopeMap().catch(() => ({}) as Record<string, string>),
    ])
    employees = employeesResult.rows
    total = employeesResult.total
    EMPLOYEE_FK_LOOKUPS.forEach((l, i) => {
      lookupOptions[l.column] = sortOptionsByLabelOrder(lookupResults[i], l.labelOrder)
    })
    partOptions = partOptionsResult
    storeScopeMap = storeScopeResult
  } catch (e) {
    error = e instanceof Error ? e.message : "직원 정보를 불러오지 못했습니다."
  }

  // 열 관리(표시 여부·순서) — 계정별이 아니라 테이블 전체 공통 설정, 데이터 테이블 뷰어와 동일한
  // table_column_prefs를 "employees" 키로 공유한다.
  const { hiddenColumns: savedHidden, columnOrder: savedOrder } = await getColumnPrefs("employees").catch(
    () => ({ hiddenColumns: [] as string[], columnOrder: [] as string[] }),
  )
  let orderedColumns: string[] = [...EMPLOYEE_COLUMNS]
  if (savedOrder.length > 0) {
    const savedValid = savedOrder.filter((c) => orderedColumns.includes(c))
    orderedColumns = [...savedValid, ...orderedColumns.filter((c) => !savedValid.includes(c))]
  }
  const toggleableColumns = orderedColumns
  const hiddenColumns = savedHidden.filter((c) => toggleableColumns.includes(c))
  const visibleColumns = orderedColumns.filter((c) => !hiddenColumns.includes(c))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">직원 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total !== null ? `총 ${total}명의 직원` : "직원 목록"}
          </p>
        </div>
        <InviteButton />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <EmployeeFilters
          storeOptions={lookupOptions.store_id ?? []}
          partOptions={partOptions}
          storeScopeMap={storeScopeMap}
        />
        <ColumnSettingsMenu
          tableName="employees"
          allColumns={toggleableColumns}
          hiddenColumns={hiddenColumns}
        />
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
          columns={visibleColumns}
          partOptions={partOptions}
          storeScopeMap={storeScopeMap}
        />
      )}
    </div>
  )
}
