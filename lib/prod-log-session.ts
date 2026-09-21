import "server-only"
import { cookies } from "next/headers"
import { createHmac, timingSafeEqual } from "crypto"

// 생산 기록 공용 PIN 인증 — lib/raw-stock-session.ts와 동일한 HMAC 쿠키 패턴을 그대로 따른다.
// 별도 쿠키 이름을 쓰는 이유는 개념이 다른 작업 세션이기 때문(재고 입고/폐기 세션과 생산 기록
// 세션은 서로의 인증을 상속하지 않는다).

const IDLE_MS = 10 * 60 * 1000 // 10분 무입력 시 자동 종료

const COOKIE_NAME = "prod_log_actor"

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

export async function setProdLogActor(staffId: string): Promise<void> {
  const store = await cookies()
  const expiresAtMs = Date.now() + IDLE_MS
  store.set(COOKIE_NAME, encode(staffId, expiresAtMs), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: IDLE_MS / 1000,
  })
}

export async function getProdLogActor(): Promise<string | null> {
  const store = await cookies()
  const raw = store.get(COOKIE_NAME)?.value
  if (!raw) return null
  const decoded = decode(raw)
  return decoded?.staffId ?? null
}

export async function clearProdLogActor(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}
