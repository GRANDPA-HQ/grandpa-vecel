import { redirect } from "next/navigation"

// PIN 발급 관리가 직원 관리 서브메뉴로 이동했으므로, 예전 경로는 새 경로로 보낸다.
export default function AttendanceManagePageRedirect() {
  redirect("/dashboard/employees/pin")
}
