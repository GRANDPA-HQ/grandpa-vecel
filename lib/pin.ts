import "server-only"
import { randomBytes, scrypt, timingSafeEqual } from "crypto"
import { promisify } from "util"

// SP 출퇴근 키오스크 PIN 해시 유틸 — bcrypt 등 신규 의존성 없이 Node 내장 scrypt 사용.
// 저장 형식: "salt(hex):hash(hex)" 한 문자열 (별도 salt 컬럼 불필요)

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>
const KEY_LEN = 32

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex")
  const derived = await scryptAsync(pin, salt, KEY_LEN)
  return `${salt}:${derived.toString("hex")}`
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":")
  if (!salt || !hashHex) return false
  const derived = await scryptAsync(pin, salt, KEY_LEN)
  const storedBuf = Buffer.from(hashHex, "hex")
  return derived.length === storedBuf.length && timingSafeEqual(derived, storedBuf)
}

/** 4자리 PIN 자동 생성 (0000~9999, 앞자리 0 허용) */
export function generatePin(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0")
}
