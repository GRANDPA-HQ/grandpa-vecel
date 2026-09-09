import { signOut } from "@/app/actions/auth"
import { LogOut } from "lucide-react"
import { cn } from "@/lib/utils"

export function SignOutButton({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        title="로그아웃"
        className={cn(
          "flex w-full items-center gap-3 py-3 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200",
          collapsed ? "justify-center px-0" : "px-4",
        )}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!collapsed && "로그아웃"}
      </button>
    </form>
  )
}
