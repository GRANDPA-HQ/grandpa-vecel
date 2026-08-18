"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

type Result = { error?: string; success?: boolean }

async function requireUser(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return !!user
}

// table_column_prefs 한 행에 저장된 필드(hidden_columns, column_order)만 부분 upsert한다.
// PostgREST의 merge-duplicates upsert는 페이로드에 없는 컬럼은 충돌 시 건드리지 않으므로
// 열 숨김/열 순서를 각각 독립적으로 저장해도 서로의 값을 덮어쓰지 않는다.
async function upsertColumnPrefs(tableName: string, patch: Record<string, unknown>): Promise<Result> {
  if (!(await requireUser())) return { error: "로그인이 필요합니다." }

  const admin = createAdminClient()
  const { error } = await admin
    .from("table_column_prefs")
    .upsert(
      { table_name: tableName, updated_at: new Date().toISOString(), ...patch },
      { onConflict: "table_name" },
    )

  if (error) return { error: "설정을 저장하지 못했습니다." }

  revalidatePath(`/dashboard/data-table/${tableName}`)
  return { success: true }
}

// 열 표시/숨김 설정 — 계정별이 아니라 테이블당 하나만 존재하는 전체 공통 설정이다.
// (Notion의 "속성 표시 여부"처럼 필요한 컬럼만 보이게 하되, 모든 직원에게 동일하게 적용됨)
export async function setHiddenColumns(tableName: string, hiddenColumns: string[]): Promise<Result> {
  return upsertColumnPrefs(tableName, { hidden_columns: hiddenColumns })
}

// 열 순서 설정 — 드래그로 재정렬한 결과를 전체 공통으로 저장한다.
export async function setColumnOrder(tableName: string, columnOrder: string[]): Promise<Result> {
  return upsertColumnPrefs(tableName, { column_order: columnOrder })
}
