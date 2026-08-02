import { redirect } from "next/navigation"
import { Store } from "lucide-react"
import { getCurrentEmployee } from "@/lib/permissions"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardChatSidebar } from "@/components/dashboard-chat-sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const employee = await getCurrentEmployee()
  if (!employee) redirect("/login")

  return (
    <div className="flex h-svh bg-background text-foreground">
      <DashboardSidebar isManager={employee.isSenior} userName={employee.name} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {employee.storeName && (
          <header className="flex items-center justify-end border-b border-border px-6 py-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              <Store className="h-3.5 w-3.5" />
              {employee.storeName}
            </span>
          </header>
        )}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
      <DashboardChatSidebar />
    </div>
  )
}
