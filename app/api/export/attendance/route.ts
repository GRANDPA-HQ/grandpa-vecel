import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { getAttendanceHistory } from "@/app/actions/attendance"
import { isValidMonthStr, currentMonthKst } from "@/lib/date-kst"

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "-"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}

// 대략적인 컬럼 폭 자동 조정 (한글은 2칸 기준)
const width = (s: string) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 127 ? 2 : 1), 0)

/** 근태관리 화면(직원별 월간 합계)의 엑셀 추출 — /dashboard/attendance/history와 동일한 데이터. */
export async function GET(req: NextRequest) {
  const monthParam = req.nextUrl.searchParams.get("month") ?? undefined
  const month = isValidMonthStr(monthParam) ? monthParam : currentMonthKst()

  const result = await getAttendanceHistory(month)
  if ("error" in result) {
    return new NextResponse(result.error, { status: 400 })
  }

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(`${month} 근태`.slice(0, 31))

  const header = ["이름", "근무일수", "총 근무시간", "총 휴게시간"]
  const headerRow = worksheet.addRow(header)
  headerRow.font = { bold: true }

  const rows = result.totals.map((t) => [
    t.staffName,
    t.workDays,
    formatMinutes(t.workMinutes),
    formatMinutes(t.breakMinutes),
  ])

  rows.forEach((r) => worksheet.addRow(r))

  header.forEach((h, i) => {
    const dataWidths = rows.map((r) => width(String(r[i] ?? "")))
    worksheet.getColumn(i + 1).width = Math.min(50, Math.max(width(h), ...dataWidths, 0) + 2)
  })

  const buf = await workbook.xlsx.writeBuffer()
  const filename = `근태관리_${month}.xlsx`

  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  })
}
