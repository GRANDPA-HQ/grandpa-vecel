"use client"

import { useState, useRef } from "react"
import { Upload, Download, Trash2, Loader2, Link, FileImage } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { withBasePath } from "@/lib/base-path"

const FIELDS = [
  "날짜",
  "생산품명",
  "생산품 코드",
  "담당자",
  "시작시간",
  "소요시간",
  "생산량",
  "단계",
  "비고",
]

type Row = Record<string, string>
type InputMode = "file" | "drive"

function toCSV(rows: Row[]): string {
  const header = FIELDS.join(",")
  const body = rows.map((row) =>
    FIELDS.map((f) => {
      const v = row[f] ?? ""
      return v.includes(",") || v.includes('"') || v.includes("\n")
        ? `"${v.replace(/"/g, '""')}"`
        : v
    }).join(","),
  )
  return [header, ...body].join("\n")
}

function downloadCSV(rows: Row[]) {
  const bom = "﻿"
  const blob = new Blob([bom + toCSV(rows)], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `생산일지_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function isDriveUrl(url: string): boolean {
  return url.includes("drive.google.com")
}

export default function ProductionLogPage() {
  const [mode, setMode] = useState<InputMode>("file")
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [driveUrl, setDriveUrl] = useState("")
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [processedImages, setProcessedImages] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setRows([])
    setError(null)
    if (file.type === "application/pdf") {
      setImagePreview("pdf")
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => setImagePreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  async function handleExtract() {
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      if (mode === "file") {
        if (!imageFile) return
        fd.append("image", imageFile)
      } else {
        if (!driveUrl.trim()) return
        if (!isDriveUrl(driveUrl)) {
          setError("올바른 Google Drive 링크를 입력하세요.")
          return
        }
        fd.append("driveUrl", driveUrl.trim())
      }
      const res = await fetch(withBasePath("/api/production-log/extract"), { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "알 수 없는 오류")
      setRows(data.rows as Row[])
      setProcessedImages(data.processedImages ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "분석 실패")
    } finally {
      setLoading(false)
    }
  }

  function handleCellChange(rowIdx: number, field: string, value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === rowIdx ? { ...row, [field]: value } : row)),
    )
  }

  function addRow() {
    const empty: Row = {}
    for (const f of FIELDS) empty[f] = ""
    setRows((prev) => [...prev, empty])
  }

  function deleteRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  const canExtract = mode === "file" ? !!imageFile : !!driveUrl.trim()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">생산일지</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          수기 생산일지 사진을 업로드하거나 Google Drive 링크를 입력하면 AI가 데이터를 추출합니다
        </p>
      </div>

      {/* 입력 방식 탭 */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
        <button
          type="button"
          onClick={() => { setMode("file"); setError(null) }}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            mode === "file"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <FileImage className="h-4 w-4" />
          파일 업로드
        </button>
        <button
          type="button"
          onClick={() => { setMode("drive"); setError(null) }}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            mode === "drive"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Link className="h-4 w-4" />
          Google Drive 링크
        </button>
      </div>

      {/* 파일 업로드 모드 */}
      {mode === "file" && (
        <div
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card p-10 transition-colors hover:border-emerald-400 hover:bg-emerald-50/30"
          onClick={() => fileInputRef.current?.click()}
        >
          {imagePreview === "pdf" ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <svg className="h-14 w-14 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
              </svg>
              <p className="text-sm font-medium">{imageFile?.name}</p>
              <p className="text-xs text-muted-foreground">PDF 파일 선택됨</p>
            </div>
          ) : imagePreview ? (
            <img
              src={imagePreview}
              alt="업로드 미리보기"
              className="max-h-72 rounded-lg object-contain shadow"
            />
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                클릭하여 사진 또는 PDF 업로드 (JPG, PNG, WEBP, PDF)
              </p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* Google Drive 링크 모드 */}
      {mode === "drive" && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>Google Drive 이미지 파일의 공유 링크를 붙여넣으세요</span>
          </div>
          <Input
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            placeholder="https://drive.google.com/file/d/..."
            className="font-mono text-sm"
          />
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">공유 설정 확인 필요</p>
            <p>Google Drive에서 해당 파일 → 우클릭 → 공유 → <strong>링크가 있는 모든 사용자</strong>로 설정되어 있어야 합니다.</p>
          </div>
        </div>
      )}

      {/* 분석 버튼 */}
      <div className="flex gap-3">
        <Button
          onClick={handleExtract}
          disabled={!canExtract || loading}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {mode === "drive" ? "Drive에서 가져오는 중..." : "분석 중..."}
            </>
          ) : (
            "AI로 데이터 추출"
          )}
        </Button>
        {rows.length > 0 && (
          <>
            <Button variant="outline" onClick={addRow} className="gap-2">
              행 추가
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadCSV(rows)}
              className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              <Download className="h-4 w-4" />
              CSV 다운로드
            </Button>
          </>
        )}
      </div>

      {/* 에러 */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* 추출된 데이터 테이블 */}
      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            추출된 데이터 ({rows.length}행){processedImages !== null ? ` — 이미지 ${processedImages}장 처리됨` : ""} — 셀을 클릭하여 수정할 수 있습니다
          </p>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  {FIELDS.map((f) => (
                    <th
                      key={f}
                      className="whitespace-nowrap px-3 py-2 text-left font-mono text-xs font-semibold text-muted-foreground"
                    >
                      {f}
                    </th>
                  ))}
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-border last:border-0 hover:bg-muted/20">
                    {FIELDS.map((f) => (
                      <td key={f} className="px-1 py-1">
                        <input
                          value={row[f] ?? ""}
                          onChange={(e) => handleCellChange(rowIdx, f, e.target.value)}
                          className="w-full min-w-[80px] rounded border-0 bg-transparent px-2 py-1 font-mono text-xs outline-none ring-0 focus:bg-accent/40 focus:ring-1 focus:ring-ring"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1">
                      <button
                        onClick={() => deleteRow(rowIdx)}
                        className="text-muted-foreground hover:text-destructive"
                        title="행 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
