import { redirect } from "next/navigation"

// PIN 발급 관리가 별도 페이지 없이 직원 관리 페이지(각 직원 행의 PIN 발급/재발급 버튼)로
// 합쳐졌으므로, 예전 경로는 새 위치로 보낸다.
export default function EmployeesPinPageRedirect() {
  redirect("/dashboard/employees")
}
