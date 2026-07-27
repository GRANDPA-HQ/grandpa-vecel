import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { getCurrentEmployee } from "@/lib/permissions"
import { getRecentSkuRecipes } from "@/lib/supabase/db"

export const runtime = "nodejs"

const MODEL = "claude-sonnet-5"
const MAX_TOOL_ITERATIONS = 4

const SYSTEM_PROMPT = `당신은 "그랜파" 매장 관리 대시보드에 내장된 직원용 AI 도우미입니다.
답변은 항상 한국어로, 짧고 명확하게 합니다. 마크다운 헤더나 굵은 글씨 없이 평문으로 답하세요.

# 원자재 등록 방법 (알고 있는 절차 — 도구 조회 불필요)
1. 왼쪽 메뉴에서 "데이터 테이블" 클릭
2. "테이블 선택" 목록에서 "원재료 테이블" 선택
3. 화면 우측 상단의 "데이터 추가" 버튼 클릭
4. 카테고리(category_code)를 선택하면 원재료 코드(raw_code)가 자동으로 채워집니다 (예: RAW-VFR-030)
5. 원재료명 등 별표(*)가 붙은 필수 항목을 입력하고 "추가" 버튼을 눌러 저장

# 최근 등록된 판매 레시피
사용자가 "최근 등록된 판매 레시피" 같은 질문을 하면 반드시 get_recent_sales_recipes 도구를 호출해서
실제 데이터베이스 값을 확인한 뒤 답변하세요. 추측해서 답하지 마세요.
도구 결과는 판매품(sku_code, sku_name)별로 구성 생산품(prod_name), 수량(amount), 단위(unit)를 정리해서 보여주세요.`

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_recent_sales_recipes",
    description:
      "최근 등록된 판매품(SKU)과 그 판매 레시피(구성 생산품·수량·단위)를 최신 등록순으로 조회합니다. " +
      "'최근 등록된 판매 레시피'처럼 최근 등록된 메뉴/레시피를 묻는 질문에 사용하세요.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "조회할 판매품 개수 (기본값 3, 최대 10)",
        },
      },
    },
  },
]

type ChatMessage = { role: "user" | "assistant"; content: string }

export async function POST(req: Request) {
  const employee = await getCurrentEmployee()
  if (!employee) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const history = body?.messages as ChatMessage[] | undefined
  if (!Array.isArray(history) || history.length === 0) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }

  const client = new Anthropic()
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  let reply = ""

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    let response: Anthropic.Message
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        thinking: { type: "disabled" },
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: `AI 응답 생성에 실패했습니다. (${message})` }, { status: 502 })
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    )

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const textParts: string[] = []
      for (const block of response.content) {
        if (block.type === "text") textParts.push(block.text)
      }
      reply = textParts.join("\n").trim()
      break
    }

    messages.push({ role: "assistant", content: response.content })

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const use of toolUses) {
      if (use.name !== "get_recent_sales_recipes") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: `알 수 없는 도구: ${use.name}`,
          is_error: true,
        })
        continue
      }
      try {
        const input = use.input as { limit?: number }
        const limit = Math.min(Math.max(Math.trunc(input.limit ?? 3), 1), 10)
        const recipes = await getRecentSkuRecipes(limit)
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(recipes),
        })
      } catch (e) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: e instanceof Error ? e.message : String(e),
          is_error: true,
        })
      }
    }

    messages.push({ role: "user", content: toolResults })
  }

  if (!reply) {
    reply = "죄송해요, 답변을 만들지 못했어요. 다시 한번 질문해 주세요."
  }

  return NextResponse.json({ reply })
}
