"use client"

import { useState, useTransition } from "react"
import { Trash2, KeyRound, Check } from "lucide-react"
import { updateEmployeeField, updateEmployeeStatus } from "@/app/actions/users"
import { deleteEmployee, resetEmployeePassword } from "@/app/actions/invitations"
import { COLUMN_LABELS } from "@/lib/column-labels"
import { todayKst } from "@/lib/date-kst"
import { EMPLOYEE_COLUMNS, PART_CODES_BY_STORE_SCOPE } from "@/lib/table-config"
import { cn } from "@/lib/utils"

type Option = { value: string; label: string }
type PartOption = Option & { code: string }

// FK 드롭다운 컬럼 (옵션은 서버에서 전달). part_id는 지점 scope(store/hq)에 따라 선택지를
// 좁혀야 해서 별도 처리한다 (아래 scopedPartOptions).
const FK_COLUMNS = new Set(["store_id", "position_id", "rank_id"])

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
  columns = EMPLOYEE_COLUMNS as unknown as string[],
  partOptions,
  storeScopeMap,
}: {
  employees: Record<string, unknown>[]
  lookupOptions: Record<string, Option[]>
  currentUserId?: string
  // 열 관리(표시 여부·순서)가 적용된, 실제로 렌더링할 컬럼 목록 — 생략 시 기본 전체 순서
  columns?: string[]
  partOptions: PartOption[]
  storeScopeMap: Record<string, string>
}) {
  if (employees.length === 0) {
    return <p className="text-sm text-muted-foreground">조건에 맞는 직원이 없습니다.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map((col) => (
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
              columns={columns}
              partOptions={partOptions}
              storeScopeMap={storeScopeMap}
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
  columns,
  partOptions,
  storeScopeMap,
}: {
  employee: Record<string, unknown>
  lookupOptions: Record<string, Option[]>
  isSelf: boolean
  columns: string[]
  partOptions: PartOption[]
  storeScopeMap: Record<string, string>
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const col of EMPLOYEE_COLUMNS) {
      init[col] = employee[col] === null || employee[col] === undefined ? "" : String(employee[col])
    }
    return init
  })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [resetDone, setResetDone] = useState(false)

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

  // 상태(재직/휴직/퇴사)와 퇴사일자는 함께 관리한다 — 재직·휴직이면 퇴사일자는 항상 null이어야 하고,
  // 퇴사로 바꾸는 순간에만 오늘 날짜를 기본값으로 채운다(이후 직접 수정 가능).
  function commitStatus(status: string, resignedAt: string) {
    const originalStatus = employee.status === null || employee.status === undefined ? "" : String(employee.status)
    const originalResignedAt = employee.resigned_at === null || employee.resigned_at === undefined ? "" : String(employee.resigned_at)
    setError(null)
    startTransition(async () => {
      const result = await updateEmployeeStatus(employeeId, status, resignedAt === "" ? null : resignedAt)
      if (result.error) {
        setValues((prev) => ({ ...prev, status: originalStatus, resigned_at: originalResignedAt }))
        setError(result.error)
      }
    })
  }

  function handleSelect(col: string, value: string) {
    if (col === "status") {
      if (value === "퇴사") {
        const label = values.name || "이 직원"
        if (!window.confirm(`${label}님을 퇴사 처리하시겠습니까?\n퇴사일자는 오늘 날짜로 기본 설정되며, 이후 직접 수정할 수 있습니다.`)) {
          return // 취소 시 select는 controlled value 그대로라 원래 상태로 유지됨
        }
        const resignedAt = todayKst()
        setValues((prev) => ({ ...prev, status: value, resigned_at: resignedAt }))
        commitStatus(value, resignedAt)
      } else {
        // 재직/휴직으로 바뀌면 퇴사일자는 항상 비운다
        setValues((prev) => ({ ...prev, status: value, resigned_at: "" }))
        commitStatus(value, "")
      }
      return
    }

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

    // 지점이 바뀌어 scope(store/hq)가 달라지면, 새 scope에 없는 파트는 자동으로 비운다
    if (col === "store_id") {
      const newScope = storeScopeMap[value]
      const allowedCodes = newScope ? PART_CODES_BY_STORE_SCOPE[newScope] : undefined
      const currentPartCode = partOptions.find((o) => o.value === values.part_id)?.code
      if (allowedCodes && currentPartCode && !allowedCodes.includes(currentPartCode)) {
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

  function handleResetPassword() {
    const label = values.name || values.email || "이 직원"
    if (!window.confirm(`${label}의 비밀번호를 재설정하시겠습니까?\n새 비밀번호가 즉시 적용되고 본인 이메일로 발송됩니다.`)) return
    setError(null)
    setResetDone(false)
    startTransition(async () => {
      const result = await resetEmployeePassword(employeeId)
      if (result.error) setError(result.error)
      else {
        setResetDone(true)
        setTimeout(() => setResetDone(false), 3000)
      }
    })
  }

  const selectClass = cn(
    "rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring",
    isPending && "cursor-not-allowed opacity-50",
    error && "border-destructive",
  )

  const currentPositionLabel = lookupOptions.position_id?.find((o) => o.value === values.position_id)?.label
  const isNoPartPosition = !!currentPositionLabel && NO_PART_POSITIONS.has(currentPositionLabel)

  // 소속 지점의 scope(store/hq)에 맞는 파트만 노출 — 매장은 서비스/키친, 본사는 경영지원/재무회계.
  // scope를 알 수 없는 지점(값 미배정 등)이면 전체 파트를 보여준다.
  const storeScope = storeScopeMap[values.store_id]
  const allowedPartCodes = storeScope ? PART_CODES_BY_STORE_SCOPE[storeScope] : undefined
  const scopedPartOptions = allowedPartCodes
    ? partOptions.filter((o) => allowedPartCodes.includes(o.code))
    : partOptions

  return (
    <>
      <tr className="border-b border-border last:border-0 transition-colors hover:bg-muted/30">
        {columns.map((col) => (
          <td key={col} className="px-3 py-2">
            {col === "part_id" && isNoPartPosition ? (
              <span className="text-xs text-muted-foreground" title="매니저/점장은 특정 파트에 속하지 않습니다">
                해당없음
              </span>
            ) : col === "part_id" ? (
              <select
                value={values.part_id}
                onChange={(e) => handleSelect("part_id", e.target.value)}
                disabled={isPending || scopedPartOptions.length === 0}
                className={selectClass}
              >
                <option value="">— 선택 —</option>
                {scopedPartOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
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
            ) : col === "resigned_at" && values.status !== "퇴사" ? (
              <span className="text-xs text-muted-foreground" title="재직·휴직 상태에서는 퇴사일자가 없습니다">
                —
              </span>
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
          <div className="flex items-center gap-1">
            <button
              onClick={handleResetPassword}
              disabled={isPending}
              title="비밀번호 재설정 (새 비밀번호를 본인 이메일로 발송)"
              className={cn(
                "rounded p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                resetDone
                  ? "text-emerald-600"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {resetDone ? <Check className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
            </button>
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
          </div>
        </td>
      </tr>
      {error && (
        <tr className="border-b border-border last:border-0">
          <td colSpan={columns.length + 1} className="px-3 py-2 text-xs text-destructive">
            {error}
          </td>
        </tr>
      )}
    </>
  )
}
