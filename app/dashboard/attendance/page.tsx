import { redirect } from "next/navigation"

// PIN 체크인 화면이 이제 홈(/dashboard) 자체가 되었으므로, 예전 경로는 홈으로 보낸다.
export default function AttendancePageRedirect() {
  redirect("/dashboard")
}
