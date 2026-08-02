"use client"

import { useEffect, useRef, useState } from "react"
import { MessageCircle, RotateCcw, Send, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDraggableButton } from "@/components/use-draggable-button"

type ChatMessage = { role: "user" | "assistant"; content: string }

const PRESET_QUESTIONS = ["최근 등록된 판매 레시피", "원자재 등록 방법"]

export function DashboardChatSidebar() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { offset, onMouseDown, wasDragged, resetPosition } = useDraggableButton("ai-chat-button-pos")
  // 오른쪽 가장자리에 고정하고 세로로만 옮길 수 있게 한다 (x축 이동은 무시)
  const moved = offset.y !== 0

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, loading])

  async function send(question: string) {
    const text = question.trim()
    if (!text || loading) return

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }]
    setMessages(nextMessages)
    setInput("")
    setError(null)
    setLoading(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "요청에 실패했습니다.")
      setMessages((cur) => [...cur, { role: "assistant", content: data.reply as string }])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    send(input)
  }

  if (!open) {
    return (
      // 오른쪽 가장자리에 고정, 세로(y)로만 드래그해 옮긴다 (x축 이동값은 무시)
      <div
        style={{ transform: `translateY(${offset.y}px)` }}
        className="fixed bottom-24 right-0 z-40"
      >
        <button
          type="button"
          onMouseDown={onMouseDown}
          onClick={() => {
            // 드래그로 옮긴 직후의 클릭은 열기 동작으로 이어지지 않게 막는다
            if (wasDragged()) return
            setOpen(true)
          }}
          title="AI 도우미 열기 (위아래로 드래그해서 위치를 옮길 수 있어요)"
          className="flex cursor-grab items-center gap-1.5 rounded-l-full border border-r-0 border-border bg-emerald-600 py-3 pl-4 pr-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-emerald-700 active:cursor-grabbing"
        >
          <MessageCircle className="h-4 w-4" />
        </button>

        {moved && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              resetPosition()
            }}
            title="기본 위치로 되돌리기"
            className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-white text-muted-foreground shadow transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
    )
  }

  return (
    <aside className="fixed right-0 top-0 z-50 flex h-full w-96 max-w-[90vw] flex-col border-l border-border bg-card shadow-2xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-foreground">AI 도우미</h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="닫기"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 메시지 목록 */}
      <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        <div className="max-w-[85%] rounded-lg rounded-tl-none bg-muted px-3 py-2 text-sm text-foreground">
          안녕하세요! 판매 레시피 조회나 원자재 등록 방법에 대해 물어보세요.
        </div>

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
              m.role === "user"
                ? "ml-auto rounded-tr-none bg-emerald-600 text-white"
                : "rounded-tl-none bg-muted text-foreground",
            )}
          >
            {m.content}
          </div>
        ))}

        {loading && (
          <div className="max-w-[85%] rounded-lg rounded-tl-none bg-muted px-3 py-2 text-sm text-muted-foreground">
            답변을 준비하고 있어요...
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

      {/* 자주 묻는 질문 */}
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-3">
          {PRESET_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              disabled={loading}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* 입력창 */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="질문을 입력하세요"
          disabled={loading}
          className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          title="전송"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </aside>
  )
}
