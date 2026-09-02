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
} {
  if (todayLogs.length === 0) return { status: "BEFORE_WORK", breakCount: 0 }

  const sorted = [...todayLogs].sort((a, b) => a.checked_at.localeCompare(b.checked_at))
  const last = sorted[sorted.length - 1].check_type
  const breakCount = sorted.filter((l) => l.check_type === "BREAK_START").length

  const status: AttendanceStatus =
    last === "BREAK_START" ? "ON_BREAK" : last === "OUT" ? "DONE" : "WORKING" // IN 또는 BREAK_END → 근무중

  return { status, breakCount }
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
