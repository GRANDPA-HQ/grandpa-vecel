// 작성 중인 모달 내용을 브라우저 localStorage에만 임시저장하는 유틸.
// 서버로 전송되지 않으므로 같은 브라우저를 쓰는 사람이 아니면 절대 볼 수 없다.

export function saveDraft<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() }))
  } catch {
    // 저장 공간 부족 등은 임시저장 기능 자체를 막을 정도의 문제가 아니므로 무시
  }
}

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data: T }
    return parsed.data ?? null
  } catch {
    return null
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // no-op
  }
}
