"use client"

import Link from "next/link"
import { Pin } from "lucide-react"
import type { ActiveNotice } from "@/app/actions/notices"

export function NoticeWidget({
  notices,
  onSelectNotice,
}: {
  notices: ActiveNotice[]
  onSelectNotice: (noticeId: string) => void
}) {
  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Pin className="h-3.5 w-3.5" /> 매장 공지 현황
        </span>
        {notices.length > 0 && (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
            진행중 {notices.length}
          </span>
        )}
      </div>
      {notices.length === 0 ? (
        <p className="px-4 py-3 text-center text-xs text-muted-foreground">진행중인 공지가 없습니다.</p>
      ) : (
        notices.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onSelectNotice(n.id)}
            className="flex w-full items-center gap-2 border-b border-border px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-muted/50"
          >
            <span className="flex-1 truncate">{n.title}</span>
            <span className="shrink-0 text-xs font-semibold text-amber-700">
              미확인 {n.unread}/{n.total}
            </span>
            <span className="shrink-0 text-muted-foreground">›</span>
          </button>
        ))
      )}
      <Link
        href="/dashboard/attendance/notices"
        className="block border-t border-border py-2 text-center text-xs font-medium text-primary hover:bg-muted/50"
      >
        더보기 › 전체 공지함
      </Link>
    </div>
  )
}
