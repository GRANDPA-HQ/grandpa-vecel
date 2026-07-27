"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// 이 이상 움직이면 드래그로 간주해 클릭(버튼 동작)을 막는다
const DRAG_THRESHOLD = 4

/**
 * 화면에 고정된 플로팅 버튼을 드래그로 옮길 수 있게 해주는 훅.
 * - 기본 위치(CSS의 bottom/right 등)는 그대로 두고, translate(offset)으로 이동시킨다.
 * - 옮긴 위치는 localStorage에 저장해 새로고침해도 유지된다.
 * - 더블클릭하면 기본 위치로 초기화된다.
 */
export function useDraggableButton(storageKey: string) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const movedRef = useRef(false)
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  // 저장된 위치 복원 (마운트 시 1회)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setOffset(JSON.parse(saved))
    } catch {}
  }, [storageKey])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      movedRef.current = false
      dragState.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y }

      const onMove = (ev: MouseEvent) => {
        const d = dragState.current
        if (!d) return
        const dx = ev.clientX - d.startX
        const dy = ev.clientY - d.startY
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) movedRef.current = true
        setOffset({ x: d.baseX + dx, y: d.baseY + dy })
      }
      const onUp = () => {
        setOffset((cur) => {
          try {
            localStorage.setItem(storageKey, JSON.stringify(cur))
          } catch {}
          return cur
        })
        dragState.current = null
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [offset, storageKey],
  )

  // 클릭 핸들러에서 "이번 상호작용이 드래그였는지" 확인할 때 사용 (드래그였으면 클릭 동작을 막는다)
  const wasDragged = useCallback(() => movedRef.current, [])

  const resetPosition = useCallback(() => {
    setOffset({ x: 0, y: 0 })
    try {
      localStorage.removeItem(storageKey)
    } catch {}
  }, [storageKey])

  return { offset, onMouseDown, wasDragged, resetPosition }
}
