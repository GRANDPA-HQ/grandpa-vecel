"use server"

import { updateTableRow, insertTableRow } from "@/lib/supabase/db"

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

    await updateTableRow(table, pkColumn, pkValue, { [column]: parsed })
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
    await insertTableRow(table, parsed)
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
