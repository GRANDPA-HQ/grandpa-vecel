"use server"

import { getTableRows, getSkuOptions, getProdOptions, getRawOptions } from "@/lib/supabase/db"
import {
  PAGE_SIZE,
  TABLE_DEFAULT_SORT,
  TABLE_SEARCH_COLUMNS,
  type RowCursor,
} from "@/lib/table-config"

export type LoadMoreResult = {
  rows: Record<string, unknown>[]
  nextCursor: RowCursor | null
  error: string | null
}

/**
 * 커서 페이지네이션: 주어진 커서 이후의 다음 페이지를 조회한다.
 * 정렬/검색 조건은 페이지(서버 컴포넌트)와 동일한 공유 설정으로 재계산한다.
 */
export async function loadMoreRows(
  tableName: string,
  pkColumn: string,
  cursor: RowCursor,
  sort?: string,
  dir?: "asc" | "desc",
  q?: string,
): Promise<LoadMoreResult> {
  try {
    const defaultSort = TABLE_DEFAULT_SORT[tableName]
    const sortColumn = sort || defaultSort?.column
    const sortDir: "asc" | "desc" = dir ?? defaultSort?.dir ?? "asc"
    const searchColumns = TABLE_SEARCH_COLUMNS[tableName] ?? []
    const searchQuery = q?.trim() ?? ""

    // tb_sku_recipe 검색: sku_id/prod_id는 UUID라서 코드·이름을 id 목록으로 변환해 검색
    let idInColumns: { column: string; ids: string[] }[] | undefined
    if (tableName === "tb_sku_recipe" && searchQuery) {
      const [skuOpts, prodOpts] = await Promise.all([
        getSkuOptions().catch(() => []),
        getProdOptions().catch(() => []),
      ])
      const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase()
      const nq = norm(searchQuery)
      idInColumns = [
        { column: "sku_id",  ids: skuOpts.filter((o) => norm(o.label).includes(nq)).map((o) => o.value) },
        { column: "prod_id", ids: prodOpts.filter((o) => norm(o.label).includes(nq)).map((o) => o.value) },
      ]
    }

    // tb_prod_recipe 검색: prod_id/raw_id는 UUID라서 코드·이름을 id 목록으로 변환해 검색
    if (tableName === "tb_prod_recipe" && searchQuery) {
      const [prodOpts, rawOpts] = await Promise.all([
        getProdOptions().catch(() => []),
        getRawOptions().catch(() => []),
      ])
      const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase()
      const nq = norm(searchQuery)
      idInColumns = [
        { column: "prod_id", ids: prodOpts.filter((o) => norm(o.label).includes(nq)).map((o) => o.value) },
        { column: "raw_id",  ids: rawOpts.filter((o) => norm(o.label).includes(nq)).map((o) => o.value) },
      ]
    }

    const result = await getTableRows(tableName, PAGE_SIZE, 0, {
      orderBy: sortColumn,
      orderDir: sortDir,
      pkColumn,
      cursor,
      search:
        searchColumns.length > 0 && searchQuery
          ? { columns: searchColumns, query: searchQuery, idInColumns }
          : undefined,
    })

    return { rows: result.rows, nextCursor: result.nextCursor, error: null }
  } catch (e) {
    return { rows: [], nextCursor: null, error: e instanceof Error ? e.message : String(e) }
  }
}
