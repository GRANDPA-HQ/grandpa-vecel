"use server"

import {
  updateTableRow,
  insertTableRow,
  deleteTableRow,
  deleteTableRows,
  getRowValue,
  getRowsByPk,
  getNextSkuCode,
  getNextRawCode,
  getNextProdCode,
} from "@/lib/supabase/db"
import { recordAuditLog } from "@/lib/audit-log"
import { TABLE_PK } from "@/lib/table-config"
import { createAdminClient } from "@/lib/supabase/admin"

export async function fetchNextSkuCode(categoryCode: string): Promise<string> {
  try {
    return await getNextSkuCode(categoryCode)
  } catch {
    return `${categoryCode.trim().toUpperCase()}_001`
  }
}

export async function fetchNextRawCode(categoryCode: string): Promise<string> {
  try {
    return await getNextRawCode(categoryCode)
  } catch {
    return `RAW-${categoryCode.trim().toUpperCase()}-001`
  }
}

export async function fetchNextProdCode(categoryCode: string): Promise<string> {
  try {
    return await getNextProdCode(categoryCode)
  } catch {
    return `PROD-${categoryCode.trim().toUpperCase()}-001`
  }
}

// 포장 부자재 ID는 접두사 없이 "카테고리-번호" 형식 (예: BOWL-008, PACK_AUX-013).
// 같은 카테고리의 기존 ID 중 가장 큰 번호 + 1을 돌려준다. 카테고리명에 '_'가 있어
// LIKE 와일드카드로 다른 카테고리가 섞일 수 있으므로 접두사를 한 번 더 정확히 비교한다.
export async function fetchNextSubmatCode(categoryCode: string): Promise<string> {
  const category = categoryCode.trim().toUpperCase()
  const fallback = `${category}-001`
  if (!category) return fallback
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("tb_submat_mst")
      .select("submat_id")
      .like("submat_id", `${category}-%`)
    if (error) return fallback
    let max = 0
    let width = 3
    for (const row of data ?? []) {
      const id = String(row.submat_id ?? "")
      const m = id.match(/^(.*)-(\d+)$/)
      if (!m || m[1].toUpperCase() !== category) continue
      max = Math.max(max, Number.parseInt(m[2], 10))
      width = Math.max(width, m[2].length)
    }
    return `${category}-${String(max + 1).padStart(width, "0")}`
  } catch {
    return fallback
  }
}

export async function updateRow(
  table: string,
  pkColumn: string,
  pkValue: string,
  column: string,
  newValue: string,
  originalType: string,
): Promise<{ error: string | null }> {
  try {
    let parsed: unknown = newValue

    if (newValue === "" || newValue === "null") {
      parsed = null
    } else if (originalType === "number") {
      const n = Number(newValue)
      if (!isNaN(n)) parsed = n
    } else if (originalType === "boolean") {
      if (newValue === "true") parsed = true
      else if (newValue === "false") parsed = false
    } else if (originalType === "object" || newValue.startsWith("[") || newValue.startsWith("{")) {
      try {
        parsed = JSON.parse(newValue)
      } catch {}
    }

    // PATCH 직전에 이전 값을 읽어둬야 감사 로그로 남겨 나중에 되돌릴 수 있다
    const oldValue = await getRowValue(table, pkColumn, pkValue, column).catch(() => undefined)
    await updateTableRow(table, pkColumn, pkValue, { [column]: parsed })
    await recordAuditLog({
      tableName: table,
      pkColumn,
      pkValue,
      action: "update",
      columnName: column,
      oldValue: oldValue ?? null,
      newValue: parsed,
    })
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteRow(
  table: string,
  pkColumn: string,
  pkValue: string,
): Promise<{ error: string | null }> {
  try {
    const [oldRow] = await getRowsByPk(table, pkColumn, [pkValue]).catch(() => [])
    await deleteTableRow(table, pkColumn, pkValue)
    if (oldRow) {
      await recordAuditLog({ tableName: table, pkColumn, pkValue, action: "delete", oldValue: oldRow })
    }
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteRows(
  table: string,
  pkColumn: string,
  pkValues: string[],
): Promise<{ error: string | null }> {
  try {
    const oldRows = await getRowsByPk(table, pkColumn, pkValues).catch(() => [])
    await deleteTableRows(table, pkColumn, pkValues)
    await Promise.all(
      oldRows.map((row) =>
        recordAuditLog({
          tableName: table,
          pkColumn,
          pkValue: String(row[pkColumn] ?? ""),
          action: "delete",
          oldValue: row,
        }),
      ),
    )
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function insertRow(
  table: string,
  values: Record<string, string>,
  columnTypes: Record<string, string>,
): Promise<{ error: string | null }> {
  try {
    const parsed: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(values)) {
      if (val === "" || val === "null") continue
      const colType = columnTypes[key]
      if (colType === "integer" || colType === "number") {
        const n = Number(val)
        if (!isNaN(n)) parsed[key] = n
        else parsed[key] = val
      } else if (colType === "boolean") {
        if (val === "true") parsed[key] = true
        else if (val === "false") parsed[key] = false
      } else if (val.startsWith("[") || val.startsWith("{")) {
        try { parsed[key] = JSON.parse(val) } catch { parsed[key] = val }
      } else {
        parsed[key] = val
      }
    }
    const created = await insertTableRow(table, parsed)
    if (created) {
      const pkColumn = TABLE_PK[table] ?? "id"
      const pkValue = created[pkColumn]
      if (pkValue !== undefined && pkValue !== null) {
        await recordAuditLog({
          tableName: table,
          pkColumn,
          pkValue: String(pkValue),
          action: "insert",
          newValue: created,
        })
      }
    }
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
