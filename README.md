# 직원 관리 대시보드

매장 직원 관리, 데이터 조회, 버그 리포트를 위한 내부 운영 도구입니다.

## 접속 주소

**https://grandpa-vecel.vercel.app/**

## 로그인 안내

이 서비스는 **관리자가 초대한 이메일만 회원가입이 가능**합니다.

1. 관리자에게 이메일 등록을 요청합니다.
2. 등록 완료 후 위 주소에서 해당 이메일로 회원가입합니다.
3. 초대되지 않은 이메일은 가입이 차단됩니다.

## 주요 기능

### 직원 관리 (점장 전용)
- 전체 직원 목록 조회
- 직원별 재직 상태 변경 (`재직` / `휴직` / `퇴사`)
- 직원별 직책 변경
- 신규 직원 초대 (이메일 등록)

### 데이터 테이블
- Supabase 데이터베이스의 테이블 목록 및 행 수 조회
- 테이블별 데이터 페이지 단위 조회 (50행 단위)
- 3분 주기 캐싱으로 빠른 응답 제공

### 생산 공정
- 준비 중

### 버그 리포트
- 버그 게시글 작성 (제목, 내용)
- 전체 리포트 목록 조회 (작성자, 날짜, 처리 상태 표시)
- 상태: `접수` / `처리중` / `완료`

## 기술 스택

| 분류 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript |
| 스타일링 | Tailwind CSS v4 |
| UI 컴포넌트 | Shadcn/ui |
| 데이터베이스 | Supabase (PostgreSQL) |
| 인증 | Supabase Auth |
| 이메일 발송 | Resend |
| 배포 | Vercel |

## 로컬 개발

```bash
npm install
npm run dev
```

`.env` 파일에 아래 환경변수가 필요합니다:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```
