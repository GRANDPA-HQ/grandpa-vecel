import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { getStaffAttendanceMonth } from "@/app/actions/attendance"
import { isValidMonthStr, currentMonthKst } from "@/lib/date-kst"

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "-"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}

function formatTime(iso: string | null): string {
  if (!iso) return "-"
  const d = new Date(iso)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`
}

/**
 * 직원 근태(일별 출퇴근 기록) 엑셀 추출. 화면(components/attendance/staff-attendance-detail.tsx)에
 * 보이는 것과 같은 항목(날짜/출근/퇴근/근무시간/휴게시간)을 그대로 내려준다.
 * 인증/권한 체크는 getStaffAttendanceMonth 내부(getCurrentEmployee + isSenior)에서 처리.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ staffId: string }> },
) {
  const { staffId } = await params
  const sp = req.nextUrl.searchParams
  const monthParam = sp.get("month") ?? undefined
  const month = isValidMonthStr(monthParam) ? monthParam : currentMonthKst()

  const result = await getStaffAttendanceMonth(staffId, month)
  if ("error" in result) {
    return new NextResponse(result.error, { status: 400 })
  }

  const { staffName, days } = result
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date))

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(`${staffName} ${month}`.slice(0, 31))

  const header = ["날짜", "출근", "퇴근", "근무시간", "휴게시간"]
  const headerRow = worksheet.addRow(header)
  headerRow.font = { bold: true }

  for (const row of sortedDays) {
    worksheet.addRow([
      row.date,
      formatTime(row.checkIn),
      row.stillWorking || row.stillOnBreak ? "미퇴근" : formatTime(row.checkOut),
      formatMinutes(row.workMinutes),
      formatMinutes(row.breakMinutes),
    ])
  }

  const width = (s: string) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 127 ? 2 : 1), 0)
  header.forEach((h, i) => {
    const col = worksheet.getColumn(i + 1)
    const dataWidths = sortedDays.map((_, ri) => width(String(worksheet.getRow(ri + 2).getCell(i + 1).value ?? "")))
    col.width = Math.min(30, Math.max(width(h), ...dataWidths, 8) + 2)
  })

  const buf = await workbook.xlsx.writeBuffer()
  const filename = `${staffName}_근태_${month}.xlsx`

  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  })
}
