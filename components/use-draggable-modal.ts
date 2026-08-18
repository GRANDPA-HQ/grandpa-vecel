"use client"

import { useCallback, useRef, useState } from "react"

/**
 * 모달 창 드래그 이동 공용 훅.
 * 헤더의 onMouseDown에 startDrag를 연결하면 창을 끌어서 옮길 수 있다.
 */
export function useDraggableModal() {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  const startDrag = useCallback((e: React.MouseEvent) => {
    // 버튼·입력 요소에서 시작된 드래그는 무시 (클릭 동작 보존)
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return
    e.preventDefault()
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: 0, baseY: 0 }
    setOffset((cur) => {
      if (dragState.current) {
        dragState.current.baseX = cur.x
        dragState.current.baseY = cur.y
      }
      return cur
    })

    const onMove = (ev: MouseEvent) => {
      const d = dragState.current
      if (!d) return
      setOffset({ x: d.baseX + ev.clientX - d.startX, y: d.baseY + ev.clientY - d.startY })
    }
    const onUp = () => {
      dragState.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [])

  // 창을 다시 열 때 위치 초기화
  const resetModal = useCallback(() => {
    setOffset({ x: 0, y: 0 })
  }, [])

  return { offset, startDrag, resetModal }
}
