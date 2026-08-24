"use client"

import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"
import { updateEmployeeField } from "@/app/actions/users"
import { deleteEmployee } from "@/app/actions/invitations"
import { COLUMN_LABELS } from "@/lib/column-labels"
import { cn } from "@/lib/utils"

type Option = { value: string; label: string }

// 표시 컬럼 순서 (employees)
const COLUMNS = [
  "name",
  "phone",
  "email",
  "store_id",
  "part_id",
  "position_id",
  "rank_id",
  "employment_type",
  "status",
  "hired_at",
  "resigned_at",
  "notes",
] as const

// FK 드롭다운 컬럼 (옵션은 서버에서 전달)
const FK_COLUMNS = new Set(["store_id", "part_id", "position_id", "rank_id"])

// CHECK 제약 드롭다운 컬럼
const ENUM_OPTIONS: Record<string, string[]> = {
  employment_type: ["정규직", "파트타임", "프리랜서"],
  status: ["재직", "휴직", "퇴사"],
}

const DATE_COLUMNS = new Set(["hired_at", "resigned_at"])

// 매니저/점장은 특정 파트에 속하지 않고 매장 전체를 관리하므로 파트 구분을 두지 않는다
const NO_PART_POSITIONS = new Set(["매니저", "점장"])

export function EmployeeTable({
  employees,
  lookupOptions,
  currentUserId,
}: {
  employees: Record<string, unknown>[]
  lookupOptions: Record<string, Option[]>
  currentUserId?: string
}) {
  if (employees.length === 0) {
    return <p className="text-sm text-muted-foreground">등록된 직원이 없습니다. 오른쪽 위 &quot;직원 추가&quot;로 초대하세요.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {COLUMNS.map((col) => (
              <th
                key={col}
                className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground"
              >
                {COLUMN_LABELS[col] ?? col}
              </th>
            ))}
            <th className="w-10 px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {employees.map((emp, i) => (
            <EmployeeRow
              key={String(emp.id ?? i)}
              employee={emp}
              lookupOptions={lookupOptions}
              isSelf={currentUserId !== undefined && String(emp.id ?? "") === currentUserId}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmployeeRow({
  employee,
  lookupOptions,
  isSelf,
}: {
  employee: Record<string, unknown>
  lookupOptions: Record<string, Option[]>
  isSelf: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const col of COLUMNS) {
      init[col] = employee[col] === null || employee[col] === undefined ? "" : String(employee[col])
    }
    return init
  })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const employeeId = String(employee.id ?? "")

  function commit(col: string, value: string) {
    const original = employee[col] === null || employee[col] === undefined ? "" : String(employee[col])
    setError(null)
    startTransition(async () => {
      const result = await updateEmployeeField(employeeId, col, value)
      if (result.error) {
        setValues((prev) => ({ ...prev, [col]: original }))
        setError(result.error)
      }
    })
  }

  function handleSelect(col: string, value: string) {
    setValues((prev) => ({ ...prev, [col]: value }))
    commit(col, value)

    // 매니저/점장으로 바뀌면 더 이상 해당하지 않는 파트 값을 자동으로 비운다
    if (col === "position_id") {
      const newLabel = lookupOptions.position_id?.find((o) => o.value === value)?.label
      if (newLabel && NO_PART_POSITIONS.has(newLabel) && values.part_id) {
        setValues((prev) => ({ ...prev, part_id: "" }))
        commit("part_id", "")
      }
    }
  }

  function handleBlur(col: string, value: string) {
    const original = employee[col] === null || employee[col] === undefined ? "" : String(employee[col])
    if (value === original) return
    commit(col, value)
  }

  function handleDelete() {
    const label = values.name || values.email || "이 직원"
    if (!window.confirm(`${label} 직원을 삭제하시겠습니까?\n로그인 계정도 함께 삭제되며 되돌릴 수 없습니다.`)) return
    setError(null)
    startTransition(async () => {
      const result = await deleteEmployee(employeeId)
      if (result.error) setError(result.error)
      // 성공 시 revalidatePath로 목록이 자동 갱신된다
    })
  }

  const selectClass = cn(
    "rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring",
    isPending && "cursor-not-allowed opacity-50",
    error && "border-destructive",
  )

  const currentPositionLabel = lookupOptions.position_id?.find((o) => o.value === values.position_id)?.label
  const isNoPartPosition = !!currentPositionLabel && NO_PART_POSITIONS.has(currentPositionLabel)

  return (
    <>
      <tr className="border-b border-border last:border-0 transition-colors hover:bg-muted/30">
        {COLUMNS.map((col) => (
          <td key={col} className="px-3 py-2">
            {col === "part_id" && isNoPartPosition ? (
              <span className="text-xs text-muted-foreground" title="매니저/점장은 특정 파트에 속하지 않습니다">
                해당없음
              </span>
            ) : FK_COLUMNS.has(col) ? (
              <select
                value={values[col]}
                onChange={(e) => handleSelect(col, e.target.value)}
                disabled={isPending || (lookupOptions[col] ?? []).length === 0}
                className={selectClass}
              >
                <option value="">— 선택 —</option>
                {(lookupOptions[col] ?? []).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : ENUM_OPTIONS[col] ? (
              <select
                value={values[col]}
                onChange={(e) => handleSelect(col, e.target.value)}
                disabled={isPending}
                className={selectClass}
              >
                {ENUM_OPTIONS[col].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ) : (
              <input
                type={DATE_COLUMNS.has(col) ? "date" : "text"}
                value={values[col]}
                disabled={isPending}
                onChange={(e) => setValues((prev) => ({ ...prev, [col]: e.target.value }))}
                onBlur={(e) => handleBlur(col, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
                className={cn(
                  "w-full min-w-[90px] rounded border border-transparent bg-transparent px-1 py-0.5 text-xs outline-none hover:border-border focus:border-ring focus:ring-1 focus:ring-ring",
                  isPending && "cursor-not-allowed opacity-50",
                )}
              />
            )}
          </td>
        ))}
        <td className="px-3 py-2">
          {!isSelf && (
            <button
              onClick={handleDelete}
              disabled={isPending}
              title="직원 삭제"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </td>
      </tr>
      {error && (
        <tr className="border-b border-border last:border-0">
          <td colSpan={COLUMNS.length + 1} className="px-3 py-2 text-xs text-destructive">
            {error}
          </td>
        </tr>
      )}
    </>
  )
}
