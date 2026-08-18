"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import ImageExtension from "@tiptap/extension-image"
import YoutubeExtension from "@tiptap/extension-youtube"
import UnderlineExtension from "@tiptap/extension-underline"
import TextAlignExtension from "@tiptap/extension-text-align"
import { TextStyle, FontFamily, FontSize, Color } from "@tiptap/extension-text-style"
import { Highlight as HighlightExtension } from "@tiptap/extension-highlight"
import { Placeholder as PlaceholderExtension } from "@tiptap/extension-placeholder"
import { SkuRecipeEmbed } from "@/components/sku-recipe-embed"
import { useRef, useCallback, useEffect } from "react"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  ImageIcon,
  MonitorPlay,
  Highlighter,
  Type,
} from "lucide-react"
import { cn } from "@/lib/utils"

const FONT_FAMILIES = [
  { label: "기본 폰트", value: "" },
  { label: "맑은 고딕", value: "'Malgun Gothic', sans-serif" },
  { label: "굴림", value: "Gulim, sans-serif" },
  { label: "돋움", value: "Dotum, sans-serif" },
  { label: "바탕", value: "Batang, serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
]

const FONT_SIZES = ["10px", "12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px", "48px"]

type ToolbarButtonProps = {
  onClick: () => void
  isActive?: boolean
  title: string
  disabled?: boolean
  children: React.ReactNode
}

function ToolbarButton({ onClick, isActive, title, disabled, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      disabled={disabled}
      title={title}
      className={cn(
        "flex h-7 min-w-7 items-center justify-center rounded px-1 text-sm transition-colors select-none",
        isActive
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && "pointer-events-none opacity-35",
      )}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
}

// 외부(부모 컴포넌트)에서 에디터 본문에 콘텐츠를 삽입할 수 있게 노출하는 API
export type RichTextEditorApi = {
  insertHtml: (html: string) => void
  getHtml: () => string
  setHtml: (html: string) => void
}

export function RichTextEditor({
  name,
  placeholder = "내용을 입력하세요...",
  defaultContent = "",
  apiRef,
}: {
  name: string
  placeholder?: string
  defaultContent?: string
  apiRef?: React.MutableRefObject<RichTextEditorApi | null>
}) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const hiddenRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    content: defaultContent,
    extensions: [
      StarterKit,
      UnderlineExtension,
      TextAlignExtension.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      HighlightExtension.configure({ multicolor: true }),
      ImageExtension.configure({ inline: false, allowBase64: true }),
      YoutubeExtension.configure({ nocookie: true, width: 480, height: 270 }),
      SkuRecipeEmbed,
      PlaceholderExtension.configure({ placeholder }),
    ],
    onUpdate({ editor }) {
      if (hiddenRef.current) hiddenRef.current.value = editor.getHTML()
    },
    editorProps: {
      attributes: { class: "outline-none" },
    },
  })

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      insertHtml: (html: string) => {
        if (!editor) return
        editor.chain().focus("end").insertContent(html).run()
        if (hiddenRef.current) hiddenRef.current.value = editor.getHTML()
      },
      getHtml: () => editor?.getHTML() ?? "",
      setHtml: (html: string) => {
        if (!editor) return
        editor.commands.setContent(html)
        if (hiddenRef.current) hiddenRef.current.value = editor.getHTML()
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [editor, apiRef])

  const onYoutubeClick = useCallback(() => {
    if (!editor) return
    const url = window.prompt("유튜브 동영상 URL을 입력하세요\n(예: https://www.youtube.com/watch?v=... 또는 https://youtu.be/...)")
    if (!url?.trim()) return
    const ok = editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run()
    if (!ok) window.alert("올바른 유튜브 URL이 아닙니다.")
  }, [editor])

  const onImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !editor) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const src = ev.target?.result as string
        editor.chain().focus().setImage({ src }).run()
      }
      reader.readAsDataURL(file)
      e.target.value = ""
    },
    [editor],
  )

  const currentFont = editor?.getAttributes("textStyle").fontFamily ?? ""
  const currentSize = editor?.getAttributes("textStyle").fontSize ?? ""

  return (
    <div className="tiptap-editor flex flex-col overflow-hidden rounded-lg border border-border">
      {/* ── 툴바 ── */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-2 py-1.5">
        {/* 폰트 패밀리 */}
        <select
          value={currentFont}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.value) {
              editor?.chain().focus().setFontFamily(e.target.value).run()
            } else {
              editor?.chain().focus().unsetFontFamily().run()
            }
          }}
          title="폰트"
          className="h-7 rounded border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        {/* 폰트 크기 */}
        <select
          value={currentSize}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.value) {
              editor?.chain().focus().setFontSize(e.target.value).run()
            } else {
              editor?.chain().focus().unsetFontSize().run()
            }
          }}
          title="글자 크기"
          className="h-7 w-20 rounded border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none"
        >
          <option value="">크기</option>
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <Sep />

        {/* 실행 취소 / 다시 실행 */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor?.can().undo()}
          title="실행 취소 (Ctrl+Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor?.can().redo()}
          title="다시 실행 (Ctrl+Y)"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <Sep />

        {/* 텍스트 서식 */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          isActive={editor?.isActive("bold")}
          title="굵게 (Ctrl+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          isActive={editor?.isActive("italic")}
          title="기울임 (Ctrl+I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          isActive={editor?.isActive("underline")}
          title="밑줄 (Ctrl+U)"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          isActive={editor?.isActive("strike")}
          title="취소선"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>

        <Sep />

        {/* 제목 */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor?.isActive("heading", { level: 1 })}
          title="제목 1"
        >
          <span className="text-[11px] font-bold leading-none">H1</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor?.isActive("heading", { level: 2 })}
          title="제목 2"
        >
          <span className="text-[11px] font-bold leading-none">H2</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor?.isActive("heading", { level: 3 })}
          title="제목 3"
        >
          <span className="text-[11px] font-bold leading-none">H3</span>
        </ToolbarButton>

        <Sep />

        {/* 목록 */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          isActive={editor?.isActive("bulletList")}
          title="글머리 기호"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          isActive={editor?.isActive("orderedList")}
          title="번호 목록"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>

        <Sep />

        {/* 정렬 */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
          isActive={editor?.isActive({ textAlign: "left" })}
          title="왼쪽 정렬"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
          isActive={editor?.isActive({ textAlign: "center" })}
          title="가운데 정렬"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign("right").run()}
          isActive={editor?.isActive({ textAlign: "right" })}
          title="오른쪽 정렬"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>

        <Sep />

        {/* 글자 색상 */}
        <label
          className={cn(
            "relative flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          title="글자 색상"
        >
          <Type className="h-3.5 w-3.5" />
          <input
            type="color"
            defaultValue="#000000"
            className="absolute inset-0 h-0 w-0 cursor-pointer opacity-0"
            onInput={(e) =>
              editor?.chain().focus().setColor((e.target as HTMLInputElement).value).run()
            }
          />
        </label>

        {/* 형광펜 */}
        <label
          className={cn(
            "relative flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors",
            editor?.isActive("highlight")
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          title="형광펜"
        >
          <Highlighter className="h-3.5 w-3.5" />
          <input
            type="color"
            defaultValue="#fef08a"
            className="absolute inset-0 h-0 w-0 cursor-pointer opacity-0"
            onInput={(e) =>
              editor
                ?.chain()
                .focus()
                .toggleHighlight({ color: (e.target as HTMLInputElement).value })
                .run()
            }
          />
        </label>

        <Sep />

        {/* 이미지 삽입 */}
        <ToolbarButton onClick={() => imageInputRef.current?.click()} title="이미지 삽입">
          <ImageIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        {/* 유튜브 동영상 임베드 */}
        <ToolbarButton onClick={onYoutubeClick} title="유튜브 동영상 삽입">
          <MonitorPlay className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      {/* ── 편집 영역 ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <EditorContent editor={editor} />
      </div>

      {/* 폼 제출용 숨김 input */}
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={defaultContent} />

      {/* 이미지 파일 선택 */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onImageChange}
      />
    </div>
  )
}
