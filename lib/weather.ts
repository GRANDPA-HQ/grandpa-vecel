import "server-only"
import { addDaysKst } from "@/lib/date-kst"

// 기상청 공공데이터포털 "단기예보 ((구)_동네예보) 조회서비스" — 초단기예보(getUltraSrtFcst).
// 매시 30분에 생성되어 45분부터 제공되며, 발표 시각 기준 향후 6시간의 기온(T1H)·하늘상태(SKY)·강수형태(PTY)를 준다.
// 과거 날짜의 날씨는 이 API로 조회할 수 없어(직전 몇 시간 예보만 제공), "오늘 하루" 단위 조회에서만 사용한다.

const KMA_ENDPOINT = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst"

// 그랜파 서래마을점(GP-001) 인근 좌표 — 서초구 반포4동(서래마을) 근사치.
// 기상청 격자 해상도(5km)상 정밀 주소가 없어도 오차 범위 안에 든다.
const STORE_LAT = 37.4979
const STORE_LON = 127.0101

/** 위경도(degree) → 기상청 동네예보 격자(nx, ny). 기상청 공식 LCC 투영 변환식. */
function latLonToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877 // 지구 반경(km)
  const GRID = 5.0 // 격자 간격(km)
  const SLAT1 = 30.0 // 투영 위도1(deg)
  const SLAT2 = 60.0 // 투영 위도2(deg)
  const OLON = 126.0 // 기준점 경도(deg)
  const OLAT = 38.0 // 기준점 위도(deg)
  const XO = 43 // 기준점 X좌표(격자)
  const YO = 136 // 기준점 Y좌표(격자)
  const DEGRAD = Math.PI / 180.0

  const re = RE / GRID
  const slat1 = SLAT1 * DEGRAD
  const slat2 = SLAT2 * DEGRAD
  const olon = OLON * DEGRAD
  const olat = OLAT * DEGRAD

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn)
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5)
  ro = (re * sf) / Math.pow(ro, sn)

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5)
  ra = (re * sf) / Math.pow(ra, sn)
  let theta = lon * DEGRAD - olon
  if (theta > Math.PI) theta -= 2.0 * Math.PI
  if (theta < -Math.PI) theta += 2.0 * Math.PI
  theta *= sn

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5)
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)
  return { nx, ny }
}

const KST_DT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/** 초단기예보 발표시각(base_date/base_time) 계산 — 매시 30분 생성, 45분부터 제공되므로 그 전엔 직전 시각을 쓴다. */
function getUltraSrtFcstBaseDateTime(): { baseDate: string; baseTime: string } {
  const parts = KST_DT_FORMATTER.formatToParts(new Date())
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const year = get("year")
  const month = get("month")
  const day = get("day")
  const minute = get("minute")
  let hour = get("hour")

  let dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  if (minute < 45) {
    hour -= 1
    if (hour < 0) {
      hour = 23
      dateStr = addDaysKst(dateStr, -1)
    }
  }
  return { baseDate: dateStr.replace(/-/g, ""), baseTime: `${String(hour).padStart(2, "0")}30` }
}

function describeSkyPty(sky?: string, pty?: string): { emoji: string; label: string } {
  const ptyCode = Number(pty ?? 0)
  if (ptyCode === 1 || ptyCode === 5) return { emoji: "🌧️", label: "비" }
  if (ptyCode === 2 || ptyCode === 6) return { emoji: "🌨️", label: "비/눈" }
  if (ptyCode === 3 || ptyCode === 7) return { emoji: "❄️", label: "눈" }
  const skyCode = Number(sky ?? 1)
  if (skyCode === 3) return { emoji: "⛅", label: "구름많음" }
  if (skyCode === 4) return { emoji: "☁️", label: "흐림" }
  return { emoji: "☀️", label: "맑음" }
}

export type StoreWeather = { tempC: number | null; emoji: string; label: string }

type KmaFcstItem = { category: string; fcstDate: string; fcstTime: string; fcstValue: string }

/**
 * 매장(그랜파 서래마을점) 위치의 현재 날씨. KMA_SERVICE_KEY 환경변수가 없거나
 * API 호출이 실패하면 null을 반환해 배지를 조용히 숨길 수 있게 한다(오늘 단위 조회 전용).
 */
export async function getStoreWeather(): Promise<StoreWeather | null> {
  const serviceKey = process.env.KMA_SERVICE_KEY
  if (!serviceKey) return null

  try {
    const { nx, ny } = latLonToGrid(STORE_LAT, STORE_LON)
    const { baseDate, baseTime } = getUltraSrtFcstBaseDateTime()

    const url = new URL(KMA_ENDPOINT)
    // 공공데이터포털은 Encoding/Decoding 두 버전의 키를 같이 발급하는데, Encoding 키를 넣으면
    // URLSearchParams가 이미 인코딩된 문자를 다시 인코딩해 키가 깨진다 — 미리 디코딩해 방지.
    const normalizedKey = serviceKey.includes("%") ? decodeURIComponent(serviceKey) : serviceKey
    url.searchParams.set("serviceKey", normalizedKey)
    url.searchParams.set("pageNo", "1")
    url.searchParams.set("numOfRows", "60")
    url.searchParams.set("dataType", "JSON")
    url.searchParams.set("base_date", baseDate)
    url.searchParams.set("base_time", baseTime)
    url.searchParams.set("nx", String(nx))
    url.searchParams.set("ny", String(ny))

    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null

    const json = await res.json()
    if (json?.response?.header?.resultCode !== "00") return null

    const items = json?.response?.body?.items?.item as KmaFcstItem[] | undefined
    if (!items || items.length === 0) return null

    // 가장 이른(가장 가까운) 예보 시각 하나만 사용
    const earliestTime = [...items].sort((a, b) => (a.fcstTime < b.fcstTime ? -1 : 1))[0].fcstTime
    const atEarliest = items.filter((i) => i.fcstTime === earliestTime)
    const find = (category: string) => atEarliest.find((i) => i.category === category)?.fcstValue

    const t1h = find("T1H")
    const { emoji, label } = describeSkyPty(find("SKY"), find("PTY"))

    return { tempC: t1h !== undefined ? Number(t1h) : null, emoji, label }
  } catch {
    return null
  }
}
