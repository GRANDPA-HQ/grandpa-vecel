"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { STATUS_LABEL, type AttendanceStatus } from "@/lib/attendance-status"

const STATUS_BADGE_CLASS: Record<AttendanceStatus, string> = {
  BEFORE_WORK: "bg-muted text-muted-foreground",
  WORKING: "bg-emerald-600 text-white",
  ON_BREAK: "bg-teal-600 text-white",
  DONE: "bg-slate-500 text-white",
}

export type StaffOption = { id: string; name: string; status?: AttendanceStatus }

export function StaffGrid({
  staff,
  showStatusBadge,
  onSelect,
}: {
  staff: StaffOption[]
  showStatusBadge: boolean
  onSelect: (staffId: string) => void
}) {
  if (staff.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        등록된 직원이 없습니다. 관리자에게 직원 등록을 요청해 주세요.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {staff.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-3 py-5 text-center transition-colors active:bg-muted",
          )}
        >
          <span className="text-base font-semibold">{s.name}</span>
          {showStatusBadge && s.status && (
            <Badge className={cn("border-transparent", STATUS_BADGE_CLASS[s.status])}>
              {STATUS_LABEL[s.status]}
            </Badge>
          )}
        </button>
      ))}
    </div>
  )
}
