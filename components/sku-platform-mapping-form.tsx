"use client"

import { useMemo, useState, useTransition } from "react"
import { AlertTriangle, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select"
import { saveSkuPlatformAliases } from "@/app/actions/sku-platform-alias"

export type MappingRow = {
  platform: string
  rawName: string
  count: number
  existingSkuId: string | null
  looksTruncated: boolean
}

function rowKey(platform: string, rawName: string): string {
  return `${platform}::${rawName}`
}

export function SkuPlatformMappingForm({
  rows,
  skuOptions,
  platformLabel,
}: {
  rows: MappingRow[]
  skuOptions: SearchableOption[]
  platformLabel: Record<string, string>
}) {
  const [isPending, startTransition] = useTransition()
  const [selections, setSelections] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [rowKey(r.platform, r.rawName), r.existingSkuId ?? ""])),
  )
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const dirtyCount = useMemo(
    () =>
      rows.filter((r) => {
        const val = selections[rowKey(r.platform, r.rawName)] ?? ""
        return val && val !== (r.existingSkuId ?? "")
      }).length,
    [rows, selections],
  )

  function handleSave() {
    const payload = rows
      .map((r) => {
        const key = rowKey(r.platform, r.rawName)
        const skuId = selections[key]
        const isDirty = skuId && skuId !== (r.existingSkuId ?? "")
        return isDirty ? { platform: r.platform, rawName: r.rawName, skuId } : null
      })
      .filter((v): v is { platform: string; rawName: string; skuId: string } => v !== null)

    if (payload.length === 0) {
      setMsg({ type: "error", text: "변경된 매핑이 없습니다." })
      return
    }

    startTransition(async () => {
      const result = await saveSkuPlatformAliases(payload)
      if (result.error) {
        setMsg({ type: "error", text: result.error })
      } else {
        setMsg({
          type: "success",
          text: `${payload.length}건 저장 완료 · 기존 주문 품목 ${result.backfilled ?? 0}건에 자동 반영했습니다.`,
        })
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">플랫폼</th>
              <th className="px-4 py-3 font-medium">원문 메뉴명</th>
              <th className="px-4 py-3 font-medium text-right">건수</th>
              <th className="px-4 py-3 font-medium">SKU</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = rowKey(r.platform, r.rawName)
              return (
                <tr key={key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 align-top text-xs text-muted-foreground">
                    {platformLabel[r.platform] ?? r.platform}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <span>{r.rawName}</span>
                    {r.looksTruncated && (
                      <span
                        title="괄호 짝이 안 맞아 원본 텍스트가 중간에 잘렸을 수 있습니다. 정확한 매핑이 어려우면 건너뛰세요."
                        className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-600"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        잘림 의심
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 align-top text-right text-xs text-muted-foreground">
                    {r.count.toLocaleString("ko-KR")}건
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <SearchableSelect
                      options={skuOptions}
                      value={selections[key] ?? ""}
                      onChange={(v) => setSelections((s) => ({ ...s, [key]: v }))}
                      placeholder="SKU 선택"
                      searchPlaceholder="SKU 코드/이름 검색"
                      className="w-64"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending || dirtyCount === 0}>
          <Save className="h-4 w-4" />
          {isPending ? "저장 중..." : `변경사항 저장 (${dirtyCount}건)`}
        </Button>
        {msg && (
          <span className={msg.type === "success" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}
