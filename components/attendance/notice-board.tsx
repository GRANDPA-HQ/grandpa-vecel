"use client"

import { useState, useTransition } from "react"
import { createNotice, listNotices, type NoticeSummary } from "@/app/actions/notices"
import type { KioskStaff } from "@/app/actions/attendance"
import { STATUS_LABEL, type AttendanceStatus } from "@/lib/attendance-status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { NoticeDetailDialog } from "@/components/attendance/notice-detail-dialog"

const STATUS_BADGE_CLASS: Record<AttendanceStatus, string> = {
  BEFORE_WORK: "bg-muted text-muted-foreground",
  WORKING: "bg-emerald-600 text-white",
  ON_BREAK: "bg-teal-600 text-white",
  DONE: "bg-slate-500 text-white",
}

const PAGE_SIZE = 5

export type PositionOption = { value: string; label: string }
export type StoreOption = { value: string; label: string }

export function NoticeBoard({
  initialNotices,
  staff,
  positionOptions,
  storeOptions,
  defaultStoreId,
  canCreate,
}: {
  initialNotices: NoticeSummary[]
  staff: KioskStaff[]
  positionOptions: PositionOption[]
  storeOptions: StoreOption[]
  defaultStoreId: string
  canCreate: boolean
}) {
  const [notices, setNotices] = useState<NoticeSummary[]>(initialNotices)
  const [createOpen, setCreateOpen] = useState(false)
  const [openNoticeId, setOpenNoticeId] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const refresh = async () => {
    const result = await listNotices()
    if ("notices" in result) setNotices(result.notices)
  }

  const positionLabel = (id: string | null) =>
    id ? (positionOptions.find((p) => p.value === id)?.label ?? "알 수 없음") : "전체"

  const openNotice = notices.find((n) => n.id === openNoticeId) ?? null
  const visibleNotices = notices.slice(0, visibleCount)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">공지사항</h2>
          {canCreate && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              새 공지 작성
            </Button>
          )}
        </div>

        {notices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            미확인 공지사항 없음
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-border">
              {visibleNotices.map((n) => {
                const allAcked = n.totalStaff > 0 && n.ackCount >= n.totalStaff
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setOpenNoticeId(n.id)}
                    className="flex w-full items-center gap-3 border-b border-border bg-card px-4 py-3 text-left last:border-b-0 hover:bg-muted/50"
                  >
                    <span className="flex-1 truncate font-medium">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      대상: {positionLabel(n.targetPositionId)}
                    </span>
                    <Badge
                      className={cn(
                        "shrink-0 border-transparent",
                        allAcked ? "bg-slate-500 text-white" : "bg-amber-500 text-white",
                      )}
                    >
                      확인 {n.ackCount}/{n.totalStaff}
                    </Badge>
                    <span className="shrink-0 text-muted-foreground">›</span>
                  </button>
                )
              })}
            </div>
            {visibleCount < notices.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="self-center text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                더보기 · {notices.length - visibleCount}건 더 있음
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">직원 현황</h2>
        {staff.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            없음
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {staff.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <span className="text-sm font-medium">{s.name}</span>
                <Badge className={cn("border-transparent", STATUS_BADGE_CLASS[s.status])}>
                  {STATUS_LABEL[s.status]}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {createOpen && (
        <CreateNoticeDialog
          positionOptions={positionOptions}
          storeOptions={storeOptions}
          defaultStoreId={defaultStoreId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            refresh()
          }}
        />
      )}

      {openNotice && (
        <NoticeDetailDialog
          notice={openNotice}
          staff={staff}
          positionLabel={positionLabel(openNotice.targetPositionId)}
          onClose={() => setOpenNoticeId(null)}
          onAcked={refresh}
        />
      )}
    </div>
  )
}

function CreateNoticeDialog({
  positionOptions,
  storeOptions,
  defaultStoreId,
  onClose,
  onCreated,
}: {
  positionOptions: PositionOption[]
  storeOptions: StoreOption[]
  defaultStoreId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [targetPositionId, setTargetPositionId] = useState<string>("")
  const [storeId, setStoreId] = useState<string>(defaultStoreId)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [createdElsewhere, setCreatedElsewhere] = useState<string | null>(null)

  const submit = () => {
    if (!title.trim()) {
      setError("제목을 입력해 주세요.")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await createNotice(title, body, targetPositionId || null, storeId)
      if ("error" in result) {
        setError(result.error)
        return
      }
      if (storeId !== defaultStoreId) {
        setCreatedElsewhere(storeOptions.find((s) => s.value === storeId)?.label ?? "다른 지점")
        return
      }
      onCreated()
    })
  }

  if (createdElsewhere) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onCreated} />
        <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-background p-6 text-center shadow-xl">
          <h2 className="text-lg font-semibold">등록 완료</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            &ldquo;{createdElsewhere}&rdquo;에 등록되어 이 게시판(현재 지점)에는 표시되지 않습니다.
          </p>
          <Button className="mt-6 w-full" onClick={onCreated}>
            확인
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">새 공지 작성</h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>제목</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-2">
            <Label>내용 (선택)</Label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>대상 지점</Label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {storeOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>대상 직책</Label>
              <select
                value={targetPositionId}
                onChange={(e) => setTargetPositionId(e.target.value)}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">전체</option>
                {positionOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              취소
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "등록 중..." : "등록"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
