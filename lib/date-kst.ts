// 한국 시간(KST, UTC+9) 기준 날짜 계산 유틸 — 매출 분석 날짜 범위 필터에 사용

const KST_FORMATTER = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" })

/** 오늘 날짜를 KST 기준 "YYYY-MM-DD"로 반환 */
export function todayKst(): string {
  return KST_FORMATTER.format(new Date())
}

/** "YYYY-MM-DD" 문자열이 유효한 날짜인지 검사 */
export function isValidDateStr(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
}

/** "YYYY-MM-DD"에서 개월 수를 더하거나 뺀 날짜를 "YYYY-MM-DD"로 반환 */
export function addMonthsKst(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + months, d))
  return dt.toISOString().slice(0, 10)
}

/** "YYYY-MM-DD"에서 일수를 더하거나 뺀 날짜를 "YYYY-MM-DD"로 반환 */
export function addDaysKst(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** KST 기준 "YYYY-MM-DD" 날짜의 하루 시작 시각을 +09:00 오프셋 ISO 문자열로 변환 */
export function kstDateToIso(dateStr: string): string {
  return `${dateStr}T00:00:00+09:00`
}

/** ISO timestamptz 값을 KST 기준 "YYYY-MM-DD"로 변환 (일별 집계용) */
export function isoToKstDate(iso: string): string {
  return KST_FORMATTER.format(new Date(iso))
}

const KST_HOUR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  hourCycle: "h23",
})

/** ISO timestamptz 값을 KST 기준 시(0~23)로 변환 (시간대별 집계용) */
export function isoToKstHour(iso: string): number {
  const hourPart = KST_HOUR_FORMATTER.formatToParts(new Date(iso)).find((p) => p.type === "hour")
  return hourPart ? Number(hourPart.value) : 0
}

/** ISO timestamptz 값을 KST 기준 요일(0=월 ~ 6=일)로 변환 (요일별 집계용) */
export function isoToKstWeekday(iso: string): number {
  const dateStr = isoToKstDate(iso)
  const jsDay = new Date(`${dateStr}T00:00:00Z`).getUTCDay() // 0=일 ... 6=토
  return (jsDay + 6) % 7 // 0=월 ... 6=일
}
