"use client"

import { useState, useTransition } from "react"
import { listSpEligibleEmployees, reissuePin, type SpEmployeeRow } from "@/app/actions/attendance"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function StaffManageTable({ initialStaff }: { initialStaff: SpEmployeeRow[] }) {
  const [staffList, setStaffList] = useState<SpEmployeeRow[]>(initialStaff)
  const [issuedFor, setIssuedFor] = useState<{ id: string; name: string; pin: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    const result = await listSpEligibleEmployees()
    if ("staff" in result) setStaffList(result.staff)
  }

  const reissue = (row: SpEmployeeRow) => {
    setError(null)
    startTransition(async () => {
      const result = await reissuePin(row.id)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setIssuedFor({ id: row.id, name: row.name, pin: result.pin })
      refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        총 {staffList.length}명 · SP 파트 소속 직원(employees) 기준, 별도 등록 없이 자동으로 대상이 됩니다.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">이름</th>
              <th className="px-4 py-2 font-medium">PIN 상태</th>
              <th className="px-4 py-2 font-medium text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {staffList.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-2.5 font-medium">{row.name}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={row.hasPin ? "default" : "secondary"}>
                    {row.hasPin ? "PIN 설정됨" : "미설정"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => reissue(row)}>
                    {row.hasPin ? "PIN 재발급" : "PIN 발급"}
                  </Button>
                </td>
              </tr>
            ))}
            {staffList.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  해당 매장에 SP 파트 직원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {issuedFor && (
        <IssuedPinDialog
          name={issuedFor.name}
          pin={issuedFor.pin}
          onClose={() => setIssuedFor(null)}
        />
      )}
    </div>
  )
}

function IssuedPinDialog({ name, pin, onClose }: { name: string; pin: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-background p-6 text-center shadow-xl">
        <h2 className="text-lg font-semibold">{name}님 PIN 발급 완료</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          이 화면을 벗어나면 다시 볼 수 없습니다 — 지금 바로 직원분께 전달해 주세요.
        </p>
        <p className="mt-4 text-4xl font-bold tracking-[0.3em]">{pin}</p>
        <Button className="mt-6 w-full" onClick={onClose}>
          확인했습니다
        </Button>
      </div>
    </div>
  )
}
