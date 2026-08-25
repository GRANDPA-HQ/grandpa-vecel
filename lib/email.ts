import "server-only"
import { Resend } from "resend"

// FROM 주소는 Resend에 도메인 인증(SPF/DKIM)이 끝나야 실제 발송된다.
// RESEND_FROM_EMAIL 미설정 시 기본값으로 grandpa.co.kr 발신 주소를 사용한다.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "no-reply@grandpa.co.kr"
const FROM = `Granpa-co <${FROM_EMAIL}>`

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  return key ? new Resend(key) : null
}

function wrapEmailHtml(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1d4ed8; margin: 0 0 16px;">Granpa-co</h2>
      <h3 style="margin: 0 0 12px;">${title}</h3>
      ${bodyHtml}
      <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">
        본인이 요청하지 않았다면 이 메일을 무시하고 관리자에게 문의해주세요.
      </p>
    </div>
  `
}

/**
 * 직원 계정 생성(초대) 안내 메일. RESEND_API_KEY가 없으면 조용히 건너뛴다
 * (계정 생성 자체는 이메일 발송 성공 여부와 무관하게 이미 끝난 상태).
 */
export async function sendInviteEmail(to: string, opts: { password: string }): Promise<void> {
  const client = getClient()
  if (!client) throw new Error("RESEND_API_KEY가 설정되지 않았습니다.")

  const { error } = await client.emails.send({
    from: FROM,
    to,
    subject: "[Granpa-co] 계정이 생성되었습니다",
    html: wrapEmailHtml(
      "계정이 생성되었습니다",
      `
        <p>Granpa-co 관리 시스템 계정이 생성되었습니다.</p>
        <table style="margin: 16px 0; border-collapse: collapse;">
          <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">아이디</td><td style="font-family: monospace;">${to}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">초기 비밀번호</td><td style="font-family: monospace;">${opts.password}</td></tr>
        </table>
        <p>로그인 후 비밀번호를 변경해주세요.</p>
      `,
    ),
  })
  if (error) throw new Error(error.message)
}

/**
 * 관리자가 비밀번호를 재설정했을 때 새 비밀번호를 본인 이메일로 발송한다.
 */
export async function sendPasswordResetEmail(to: string, opts: { password: string }): Promise<void> {
  const client = getClient()
  if (!client) throw new Error("RESEND_API_KEY가 설정되지 않았습니다.")

  const { error } = await client.emails.send({
    from: FROM,
    to,
    subject: "[Granpa-co] 비밀번호가 재설정되었습니다",
    html: wrapEmailHtml(
      "비밀번호가 재설정되었습니다",
      `
        <p>관리자에 의해 비밀번호가 재설정되었습니다.</p>
        <table style="margin: 16px 0; border-collapse: collapse;">
          <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">아이디</td><td style="font-family: monospace;">${to}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">새 비밀번호</td><td style="font-family: monospace;">${opts.password}</td></tr>
        </table>
        <p>로그인 후 비밀번호를 변경해주세요.</p>
      `,
    ),
  })
  if (error) throw new Error(error.message)
}
