"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"
import { getProdLogActor, setProdLogActor } from "@/lib/prod-log-session"

type Result = { error?: string; success?: boolean; savedCount?: number }
type Actor = { staffId: string; storeId: string }

async function requireProdLogActor(): Promise<Actor | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.storeId) return { error: "소속 매장이 없어 생산 기록을 사용할 수 없습니다." }
  const staffId = await getProdLogActor()
  if (!staffId) return { error: "세션이 만료되었습니다. 다시 본인 확인을 해주세요." }
  await setProdLogActor(staffId) // 슬라이딩 만료(10분 무입력 자동 종료)
  return { staffId, storeId: employee.storeId }
}

export type ProdLogEntry = {
  prodCode: string
  workerId: string
  outputQty: number
  laborMin: number
  memo?: string
}

/**
 * 장바구니 전체 저장 — 각 줄마다 tb_prod_log 1행 + tb_prod_stock_txn PRODUCE 1행을 순차 insert한다.
 * (두 테이블에 걸친 삽입이라 DB 트랜잭션으로 묶이지 않음 — 이 앱의 다른 재고 액션들과 동일한
 * 수준의 단순함을 유지. 실패한 줄은 이후 줄 처리를 멈추고 몇 건 저장됐는지 알려준다.)
 */
export async function saveProdLog(entries: ProdLogEntry[]): Promise<Result> {
  const auth = await requireProdLogActor()
  if ("error" in auth) return { error: auth.error }
  if (entries.length === 0) return { error: "담긴 품목이 없습니다." }
  for (const e of entries) {
    if (!(e.outputQty > 0)) return { error: "생산량은 0보다 커야 합니다." }
    if (!(e.laborMin > 0)) return { error: "작업 시간을 입력해주세요." }
  }

  const admin = createAdminClient()
  let savedCount = 0

  for (const entry of entries) {
    const { data: logRow, error: logError } = await admin
      .from("tb_prod_log")
      .insert({
        store_id: auth.storeId,
        prod_code: entry.prodCode,
        worker_id: entry.workerId,
        output_qty: entry.outputQty,
        labor_min: entry.laborMin,
        memo: entry.memo?.trim() || null,
        created_by: auth.staffId,
      })
      .select("log_id")
      .single()
    if (logError) return { error: `생산 기록 저장에 실패했습니다. ${logError.message}`, savedCount }

    const { error: txnError } = await admin.from("tb_prod_stock_txn").insert({
      store_id: auth.storeId,
      prod_code: entry.prodCode,
      txn_type: "PRODUCE",
      qty: entry.outputQty,
      ref_type: "PROD_LOG",
      ref_id: logRow.log_id,
      created_by: auth.staffId,
    })
    if (txnError) return { error: `재고 반영에 실패했습니다. ${txnError.message}`, savedCount }

    savedCount++
  }

  revalidatePath("/dashboard/production-record")
  return { success: true, savedCount }
}
