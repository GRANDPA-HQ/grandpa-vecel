"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { KeyRound, X } from "lucide-react"
import { listSpEligibleEmployees, type SpEmployeeRow } from "@/app/actions/attendance"
import { StaffManageTable } from "@/components/attendance/staff-manage-table"

export function PinIssueButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="outline">
        <KeyRound className="mr-2 h-4 w-4" />
        PIN 발급
      </Button>
      {open && <PinIssueDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function PinIssueDialog({ onClose }: { onClose: () => void }) {
  const [staff, setStaff] = useState<SpEmployeeRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listSpEligibleEmployees().then((result) => {
      if ("error" in result) setError(result.error)
      else setStaff(result.staff)
    })
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 다이얼로그 */}
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">PIN 발급 관리</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              출퇴근 PIN 체크인 키오스크에서 쓸 PIN을 SP 파트 직원에게 발급/재발급합니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!error && !staff && <p className="text-sm text-muted-foreground">불러오는 중...</p>}
          {staff && <StaffManageTable initialStaff={staff} />}
        </div>
      </div>
    </div>
  )
}
