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
