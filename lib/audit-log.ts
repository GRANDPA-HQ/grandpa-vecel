import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"

type AuditAction = "insert" | "update" | "delete"

/**
 * 데이터 테이블 뷰어의 인라인 수정/추가/삭제를 tb_audit_log에 기록한다.
 * 실수로 값을 바꾸거나 행을 지웠을 때 이전 값을 찾아 되돌릴 수 있도록 하기 위함(롤백 UI는 이후 과제).
 * 로그 기록 실패가 실제 데이터 수정을 막아서는 안 되므로 항상 조용히 무시한다 —
 * 호출부(app/actions/table-edit.ts)는 이 함수의 실패를 신경 쓸 필요가 없다.
 */
export async function recordAuditLog(entry: {
  tableName: string
  pkColumn: string
  pkValue: string
  action: AuditAction
  columnName?: string
  oldValue?: unknown
  newValue?: unknown
}): Promise<void> {
  try {
    const employee = await getCurrentEmployee()
    const admin = createAdminClient()
    await admin.from("tb_audit_log").insert({
      table_name: entry.tableName,
      pk_column: entry.pkColumn,
      pk_value: entry.pkValue,
      action: entry.action,
      column_name: entry.columnName ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      changed_by: employee?.id ?? null,
      changed_by_name: employee?.name ?? null,
    })
  } catch {
    // tb_audit_log가 아직 없거나(마이그레이션 전) 일시적으로 실패해도 원래 작업엔 영향 없음
  }
}
