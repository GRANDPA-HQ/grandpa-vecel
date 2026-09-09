// SP 출퇴근 키오스크 — 오늘(KST) 로그의 마지막 이벤트로 현재 상태를 파생한다.
// DB에 상태 컬럼을 두지 않고 매번 계산해, 저장된 상태와 로그가 어긋나는 일을 원천 차단한다.

export type AttendanceStatus = "BEFORE_WORK" | "WORKING" | "ON_BREAK" | "DONE"
export type CheckType = "IN" | "OUT" | "BREAK_START" | "BREAK_END"

// 클라이언트/서버 양쪽에서 쓰는 순수 포맷 체크 — server-only인 lib/pin.ts와 분리해 클라이언트 컴포넌트에서도 import 가능
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

export type AttendanceLogRow = { check_type: CheckType; checked_at: string }

export function deriveStatus(todayLogs: AttendanceLogRow[]): {
  status: AttendanceStatus
  breakCount: number
  // 오늘 출근(IN) 시각 — 근무중 상태일 때 "(09:03 출근)" 표기에 쓴다.
  checkedInAt: string | null
  // 현재 휴게가 시작된 시각 — 휴게중 상태일 때만 값이 있고, "(11:40부터)" 표기에 쓴다.
  onBreakSinceAt: string | null
} {
  if (todayLogs.length === 0) {
    return { status: "BEFORE_WORK", breakCount: 0, checkedInAt: null, onBreakSinceAt: null }
  }

  const sorted = [...todayLogs].sort((a, b) => a.checked_at.localeCompare(b.checked_at))
  const last = sorted[sorted.length - 1]
  const breakCount = sorted.filter((l) => l.check_type === "BREAK_START").length

  const status: AttendanceStatus =
    last.check_type === "BREAK_START" ? "ON_BREAK" : last.check_type === "OUT" ? "DONE" : "WORKING" // IN 또는 BREAK_END → 근무중

  const checkedInAt = sorted.find((l) => l.check_type === "IN")?.checked_at ?? null
  const onBreakSinceAt = status === "ON_BREAK" ? last.checked_at : null

  return { status, breakCount, checkedInAt, onBreakSinceAt }
}

// 상태별로 허용되는 다음 액션 — Step2 버튼 노출과 서버 액션의 상태 전이 검증에 공용으로 쓴다.
export const ACTION_ALLOWED: Record<AttendanceStatus, CheckType[]> = {
  BEFORE_WORK: ["IN"],
  WORKING: ["BREAK_START", "OUT"],
  ON_BREAK: ["BREAK_END"],
  DONE: [],
}

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  BEFORE_WORK: "출근전",
  WORKING: "근무중",
  ON_BREAK: "휴게중",
  DONE: "퇴근완료",
}

export const ACTION_LABEL: Record<CheckType, string> = {
  IN: "출근",
  OUT: "퇴근",
  BREAK_START: "휴게 시작",
  BREAK_END: "휴게 종료",
}

// PIN 화면 헤더 문구 (액션별 4종, 컴포넌트는 1개 재사용)
export const PIN_PROMPT: Record<CheckType, string> = {
  IN: "출근하려면 본인을 확인하세요",
  BREAK_START: "휴게를 시작하려면 본인을 확인하세요",
  BREAK_END: "휴게를 종료하려면 본인을 확인하세요",
  OUT: "퇴근하려면 본인을 확인하세요",
}

// 완료 화면 메시지 (액션별 4종)
export const CONFIRM_MESSAGE: Record<CheckType, string> = {
  IN: "출근합니다",
  BREAK_START: "휴게를 시작합니다",
  BREAK_END: "휴게를 종료합니다",
  OUT: "퇴근합니다",
}

// 출퇴근 이력 조회 — 하루치 로그를 순서대로 훑어 출근/퇴근/근무시간/휴게시간을 계산한다.
// 상태와 마찬가지로 별도 컬럼에 저장하지 않고 로그에서 매번 파생해, 데이터 정합성을 로그 하나로만 관리한다.
export type BreakPeriod = { start: string; end: string | null }

export type DaySummary = {
  checkIn: string | null
  checkOut: string | null
  workMinutes: number
  breakMinutes: number
  breakPeriods: BreakPeriod[]
  // 근무중/휴게중 로그만 있고 짝이 되는 이벤트가 없는 경우(퇴근 누락 등) — 이력 화면에 "미퇴근" 등으로 표기
  stillWorking: boolean
  stillOnBreak: boolean
}

export function summarizeDay(dayLogs: AttendanceLogRow[]): DaySummary {
  const sorted = [...dayLogs].sort((a, b) => a.checked_at.localeCompare(b.checked_at))

  let checkIn: string | null = null
  let checkOut: string | null = null
  let workMs = 0
  let breakMs = 0
  let workingSince: string | null = null
  let breakSince: string | null = null
  const breakPeriods: BreakPeriod[] = []

  for (const log of sorted) {
    if (log.check_type === "IN") {
      checkIn = checkIn ?? log.checked_at
      workingSince = log.checked_at
    } else if (log.check_type === "BREAK_START") {
      if (workingSince) {
        workMs += new Date(log.checked_at).getTime() - new Date(workingSince).getTime()
        workingSince = null
      }
      breakSince = log.checked_at
      breakPeriods.push({ start: log.checked_at, end: null })
    } else if (log.check_type === "BREAK_END") {
      if (breakSince) {
        breakMs += new Date(log.checked_at).getTime() - new Date(breakSince).getTime()
        breakPeriods[breakPeriods.length - 1].end = log.checked_at
        breakSince = null
      }
      workingSince = log.checked_at
    } else if (log.check_type === "OUT") {
      if (workingSince) {
        workMs += new Date(log.checked_at).getTime() - new Date(workingSince).getTime()
        workingSince = null
      }
      checkOut = log.checked_at
    }
  }

  return {
    checkIn,
    checkOut,
    workMinutes: Math.round(workMs / 60000),
    breakMinutes: Math.round(breakMs / 60000),
    breakPeriods,
    stillWorking: workingSince !== null,
    stillOnBreak: breakSince !== null,
  }
}
