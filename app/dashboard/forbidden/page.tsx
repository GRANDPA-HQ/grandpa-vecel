import Link from "next/link"
import { ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border py-24 text-center">
      <ShieldAlert className="h-10 w-10 text-muted-foreground" />
      <div>
        <h1 className="text-xl font-semibold tracking-tight">권한이 없습니다</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          이 페이지에 접근할 권한이 없습니다. 필요하다면 관리자에게 문의해주세요.
        </p>
      </div>
      <Button variant="outline" render={<Link href="/dashboard" />}>
        홈으로 이동
      </Button>
    </div>
  )
}
