"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"

type StepInput = {
  step_order: number
  item: string
  amount_g: number | null
  note: string
}

export async function saveProductionProcess(
  processId: string | null,
  productName: string,
  steps: StepInput[],
): Promise<{ error?: string; processId?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다." }

  const admin = createAdminClient()

  if (processId) {
    const { error: headerError } = await admin
      .from("tb_production_process")
      .update({
        product_name: productName,
        status: "pending",
        approved_by: null,
        approved_at: null,
        reject_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", processId)

    if (headerError) return { error: headerError.message }

    await admin.from("tb_production_process_step").delete().eq("process_id", processId)

    if (steps.length > 0) {
      const { error: stepsError } = await admin
        .from("tb_production_process_step")
        .insert(steps.map((s) => ({ ...s, process_id: processId })))
      if (stepsError) return { error: stepsError.message }
    }
  } else {
    const { data: header, error: headerError } = await admin
      .from("tb_production_process")
      .insert({ product_name: productName, author_id: user.id })
      .select("id")
      .single()

    if (headerError || !header) return { error: headerError?.message ?? "저장에 실패했습니다." }

    if (steps.length > 0) {
      const { error: stepsError } = await admin
        .from("tb_production_process_step")
        .insert(steps.map((s) => ({ ...s, process_id: header.id })))
      if (stepsError) return { error: stepsError.message }
    }

    processId = header.id
  }

  revalidatePath("/dashboard/production-write")
  revalidatePath("/dashboard/data-table/tb_production_process")
  return { success: true, processId: processId ?? undefined }
}

export async function approveProductionProcess(
  processId: string,
): Promise<{ error?: string; success?: boolean }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.isSenior) return { error: "승인 권한이 없습니다." }

  const admin = createAdminClient()

  const { error } = await admin
    .from("tb_production_process")
    .update({
      status: "approved",
      approved_by: employee.id,
      approved_at: new Date().toISOString(),
      reject_reason: null,
    })
    .eq("id", processId)

  if (error) return { error: "승인에 실패했습니다." }

  revalidatePath("/dashboard/production-write")
  revalidatePath("/dashboard/data-table/tb_production_process")
  return { success: true }
}

export async function rejectProductionProcess(
  processId: string,
  reason: string,
): Promise<{ error?: string; success?: boolean }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.isSenior) return { error: "반려 권한이 없습니다." }

  const admin = createAdminClient()

  const { error } = await admin
    .from("tb_production_process")
    .update({
      status: "rejected",
      approved_by: employee.id,
      approved_at: new Date().toISOString(),
      reject_reason: reason || "사유 없음",
    })
    .eq("id", processId)

  if (error) return { error: "반려 처리에 실패했습니다." }

  revalidatePath("/dashboard/production-write")
  revalidatePath("/dashboard/data-table/tb_production_process")
  return { success: true }
}
