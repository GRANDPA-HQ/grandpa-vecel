import type { LucideIcon } from "lucide-react"

export function ComingSoon({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description?: string
  icon: LucideIcon
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card p-16 text-center text-muted-foreground">
        <Icon className="h-8 w-8" />
        <p className="text-sm font-medium">아직 준비중입니다</p>
        <p className="text-xs text-muted-foreground/70">곧 이용하실 수 있도록 준비하고 있어요</p>
      </div>
    </div>
  )
}
