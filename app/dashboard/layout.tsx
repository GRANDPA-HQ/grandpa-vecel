import { redirect } from "next/navigation"
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
      <main className="flex-1 overflow-auto p-6">{children}</main>
      <DashboardChatSidebar />
    </div>
  )
}
