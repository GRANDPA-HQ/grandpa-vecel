import "server-only"
import { cookies } from "next/headers"
import { createHmac, timingSafeEqual } from "crypto"

// 원재료 재고관리 공용 PIN 인증 — "직원선택→PIN"으로 확인한 실제 행위자(staffId)를 공용 태블릿
// 브라우저 세션과 별개로 짧게 들고 있기 위한 쿠키. 로그인 세션(Supabase Auth)과는 다른 개념:
// 태블릿 자체는 이미 로그인돼 있고, 이 쿠키는 "지금 이 태블릿을 만지고 있는 사람이 누구인지"를 담는다.
//
// 값 형식: `${staffId}.${expiresAtMs}.${hmac}` — hmac은 SUPABASE_SERVICE_ROLE_KEY를 서명 키로 써서
// 클라이언트가 쿠키 값을 조작해 다른 직원을 사칭하지 못하게 막는다(무결성 목적, 새 비밀키 불필요).
//
// 실사(ADJ)는 설계서상 별도 PIN이 필요하므로 쿠키 이름을 분리한다(입고·폐기 세션이 있어도 실사는
// 다시 PIN을 요구).

const IDLE_MS = 10 * 60 * 1000 // 10분 무입력 시 자동 종료 (스태프업무가이드 §시작)

const COOKIE_NAMES = {
  standard: "raw_stock_actor",
  audit: "raw_stock_audit_actor",
} as const

type SessionKind = keyof typeof COOKIE_NAMES

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.")
  return key
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32)
}

function encode(staffId: string, expiresAtMs: number): string {
  const payload = `${staffId}.${expiresAtMs}`
  return `${payload}.${sign(payload)}`
}

function decode(value: string): { staffId: string; expiresAtMs: number } | null {
  const parts = value.split(".")
  if (parts.length !== 3) return null
  const [staffId, expStr, mac] = parts
  const expiresAtMs = Number(expStr)
  if (!staffId || !Number.isFinite(expiresAtMs)) return null

  const expected = sign(`${staffId}.${expStr}`)
  const macBuf = Buffer.from(mac, "utf8")
  const expectedBuf = Buffer.from(expected, "utf8")
  if (macBuf.length !== expectedBuf.length || !timingSafeEqual(macBuf, expectedBuf)) return null
  if (Date.now() > expiresAtMs) return null

  return { staffId, expiresAtMs }
}

async function setActor(kind: SessionKind, staffId: string): Promise<void> {
  const store = await cookies()
  const expiresAtMs = Date.now() + IDLE_MS
  store.set(COOKIE_NAMES[kind], encode(staffId, expiresAtMs), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: IDLE_MS / 1000,
  })
}

async function getActor(kind: SessionKind): Promise<string | null> {
  const store = await cookies()
  const raw = store.get(COOKIE_NAMES[kind])?.value
  if (!raw) return null
  const decoded = decode(raw)
  return decoded?.staffId ?? null
}

async function clearActor(kind: SessionKind): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAMES[kind])
}

export const setRawStockActor = (staffId: string) => setActor("standard", staffId)
export const getRawStockActor = () => getActor("standard")
export const clearRawStockActor = () => clearActor("standard")

export const setRawStockAuditActor = (staffId: string) => setActor("audit", staffId)
export const getRawStockAuditActor = () => getActor("audit")
export const clearRawStockAuditActor = () => clearActor("audit")
