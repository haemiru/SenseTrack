# SenseTrack 작업 로그 / 핸드오프

> 다음에 돌아와 이어서 작업하기 위한 기록. 최신 항목이 위로.
> 프로젝트 개요·아키텍처 상세는 **`CLAUDE.md`**, 변경 전 상태 분석은 **`PROJECT_ANALYSIS.html`** 참고.

---

## 2026-06-11 — 반응 감지 수정 + 리포트 개선 + 로그인/SSO + 짱샘 브랜딩

> 이 세션에서 센스트랙을 **짱샘의 책방 "도구"** 로 편입(같은 Supabase 프로젝트 공유)하고,
> `jjangsaem.com` 패밀리 서브도메인 간 **로그인 SSO**까지 구축·배포 완료.

### 한 일 요약 (시간순)
1. **"자극 적용" 무반응 버그 → UX 수정**: 카메라 미시작 시 alert만 떠서 "안 됨"처럼 보임. 버튼을 잠금 상태(`locked`) + "카메라를 먼저 시작하세요" 힌트 + 카메라 버튼 펄스 강조로 명확화. (`syncStimButtonState`)
2. **반응 감지 안 되던 문제 수정** (`sessionManager.recordFaceData`):
   - **기준점(baseline) 레이스 버그**: 0.5초 쿨타임 중 프레임이 없으면 baseline이 영영 null → 감지 막힘. 첫 프레임을 항상 기준점으로 잡도록 수정.
   - 임계값 완화(yaw/pitch 10→7도 등) + **추적 중 "움직임 %" 실시간 표시**(`reactionProgress`, 100% 도달 시 감지).
3. **리포트 개선**:
   - **반응 종류 기록**(고개 좌우/끄덕임/입 벌림/눈썹/미소) → 로그·타임라인·카드·AI 프롬프트에 표시.
   - **"이전 세션 대비"** = `localStorage`(그 기기 직전 측정)와 비교. 기록 없으면 "측정 중 변화"(초반 vs 후반). *Supabase는 읽기 막혀 있고 사용자 식별 없어서 기기 단위 localStorage 사용.*
   - **반응률 산식 재설계**: 기존(속도만 점수화, 이름과 의미 불일치) → **반응률 = 제시 횟수 중 반응 비율(%)**, 반응속도는 별도(평균 초 + 빠름/보통/느림).
4. **UI 문구 '세션' 제거**: 세션 시작/종료 → 오늘 시작/종료, 이전 세션 대비 → 지난 측정 대비, 세션 내 변화 → 측정 중 변화.
5. **저장 버튼 정직성 수정**: `saveSessionReport` 반환값 무시하고 항상 "저장 완료!" 표시하던 문제 → 실제 성공/실패 반영(녹색/빨강).
6. **로그인 사용자 기준 저장 + 로그인 모달**:
   - 마이그레이션 **`0002`**: `sensetrack_sessions`에 `user_id` + RLS를 `authenticated` 본인 행 INSERT/SELECT로 전환(익명 INSERT 제거). **실행 완료.**
   - 저장 클릭 시 미로그인이면 로그인 모달(구글/카카오=Supabase 네이티브, 네이버=책방 위임). 미로그인도 오늘 측정·리포트는 이용 가능. OAuth 리다이렉트로 리포트 안 날아가게 `sessionStorage`에 임시 보관 후 복귀 시 자동 저장.
   - 헤더 인증 칩(로그인/로그아웃), "저장하세요" 상시 안내.
7. **서브도메인 SSO 구축** (상세는 메모리 `jjangsaem-sso-architecture` + 아래):
   - 센스트랙 `src/supabase.js`를 `@supabase/ssr` `createBrowserClient` + `cookieOptions.domain='.jjangsaem.com'`(jjangsaem.com 호스트일 때만)로 전환.
   - **책방 동일 적용**(repo `C:\Users\bsuha\Claude-prj\ebook\jjangsaem-bookshop`, Next.js 16): 세션 쿠키 발급 5곳(browser/server/middleware/oauth콜백/**네이버콜백**) + `safe-redirect.ts`(외부 복귀 화이트리스트). **프로덕션 배포 완료.**
   - **네이버**: Supabase 미지원이라 책방 `/ko/auth/naver?next=<센스트랙주소>` 직접 호출 → 로그인 후 센스트랙 복귀.
8. **커스텀 도메인 연결**: `sensetrack.jjangsaem.com`(Vercel 도메인 + DNS CNAME). **OAuth는 반드시 이 도메인에서** (vercel.app은 Redirect URL 미등록 + 쿠키 도메인 불가).
9. **짱샘 브랜딩**: "전문가 의견"→"짱샘 의견", 상담 버튼→"짱샘 상담 예약" + 실제 카카오 오픈채팅 `https://open.kakao.com/o/s3YnSoni`, 로딩 문구 "AI 전문가가"→"짱샘이". 로그인 버튼을 책방과 동일 스타일(컬러 로고 + "~로 계속하기")로 통일.

### 결과 (전부 프로덕션 배포·동작 확인됨)
- 구글·카카오·네이버 로그인 ✅, 책방↔센스트랙 SSO ✅, 로그인 사용자별 저장 ✅
- 센스트랙: `https://sensetrack.jjangsaem.com`

### Git (push 완료)
- **센스트랙** `github.com/haemiru/SenseTrack` (main): `dabdcd7`,`9a4a6af`,`90d915d`,`b9a2ba8`,`4db03b1`,`4053635`,`5e4e51c`,`b52bd20`,`353c8ef`,`d9e4ece`,`ce44c01`,`b926a44`
- **책방** `github.com/haemiru/jjangsaem-bookshop` (main): `d53167f`(쿠키 SSO 4곳+헬퍼), `33a1f3f`(네이버 콜백 쿠키 + safe-redirect). *fast-forward 머지로 프로덕션 반영.*

### 외부 설정 (완료된 것 — 재현 시 참고)
- Supabase 마이그레이션 `0001`+`0002` 실행됨.
- Supabase Auth → Redirect URLs에 `https://sensetrack.jjangsaem.com/**` 등록됨.
- Vercel `sense-track` 프로젝트: 커스텀 도메인 `sensetrack.jjangsaem.com` + DNS CNAME(`sensetrack`→`4fba675dba9573fd.vercel-dns-017.com`) 연결됨.
- `VITE_BOOKSHOP_LOGIN_URL`은 코드 기본값(`https://jjangsaem.com/ko/auth`)이라 미설정해도 동작.

### ⚠️ 핵심 주의사항 (다음에 꼭 기억)
- **반드시 `sensetrack.jjangsaem.com`에서 테스트.** `sense-track.vercel.app`은 OAuth 리다이렉트가 책방으로 폴백되고 쿠키 SSO도 불가(다른 도메인).
- **쿠키 도메인 SSO 패턴**: `@supabase/ssr` + `cookieOptions.domain='.jjangsaem.com'`을 **host가 jjangsaem.com 계열일 때만**(vercel.app/localhost는 미지정). 세션 쿠키 발급하는 **모든 곳**에 적용해야 함.
- **네이버는 Supabase 네이티브 불가** → 책방 커스텀 라우트 경유만 가능.
- 쿠키 도메인 변경으로 기존 책방 로그인 사용자는 **1회 재로그인** 필요할 수 있음(데이터 영향 없음).
- 책방은 **프로덕션 매출 서비스** → 변경 시 신중히(브랜치→검토→머지).

---

## 2026-06-07 — 백엔드 Supabase 전환 + AI Claude 전환 + 배포

### 한 일 요약
1. **AI: Gemini → Claude Opus 4.7** (`claude-opus-4-7`)
   - 브라우저에서 직접 호출하지 않고 **Vercel 서버리스 함수 `/api/analyze`** 경유 → API 키 미노출.
2. **백엔드(DB): Firebase Firestore → Supabase(Postgres)**
   - 기존 **jjangsaem-bookshop** Supabase 프로젝트 공유 → 테이블명 **`sensetrack_` prefix 필수**.
3. **배포 완료** — https://sense-track.vercel.app (정상 동작 확인됨).

### 변경/추가된 파일
| 파일 | 내용 |
|------|------|
| `api/analyze.js` | **신규** Vercel 함수. `@anthropic-ai/sdk`로 `claude-opus-4-7` 호출(adaptive thinking, effort medium, max_tokens 4096). `ANTHROPIC_API_KEY`는 서버 env. |
| `src/supabase.js` | **신규** Supabase 클라이언트 + `saveSessionReport()` → `sensetrack_sessions` INSERT. |
| `src/session/aiAnalyzer.js` | **재작성** — `/api/analyze`로 POST만. 인터페이스(`generateExpertInsight(report)→string`) 동일. 실패 시 폴백. |
| `src/firebase.js` | **삭제** |
| `src/main.js` | import 한 줄 변경(`firebase.js`→`supabase.js`) + 주석 |
| `supabase/migrations/0001_sensetrack_sessions.sql` | **신규** 테이블 + RLS(익명 INSERT 허용). **이미 Supabase에 실행 완료.** |
| `.env.example` | Firebase/Gemini 키 제거 → Supabase + ANTHROPIC_API_KEY로 교체 |
| `package.json` | `firebase`,`@google/generative-ai` 제거 / `@supabase/supabase-js`,`@anthropic-ai/sdk` 추가 |
| `CLAUDE.md` | **신규** 프로젝트 가이드(새 아키텍처 반영) |
| `PROJECT_ANALYSIS.html` | **신규** 변경 전 상태 분석 보고서 |

### Git
- repo: **`github.com/haemiru/SenseTrack`** (기존 repo 그대로 사용, 히스토리 깨끗)
- 커밋 `da71446` — `feat: migrate backend to Supabase and AI to Claude Opus 4.7` (push 완료)
- ⚠️ **`WORKLOG.md`(이 파일)는 아직 커밋 안 됨.** 필요하면 커밋할 것.

### 환경변수 (값은 `.env`/Vercel에 있음 — 여기엔 기록 안 함)
**로컬 `.env`** (gitignore됨, 평문):
- `VITE_SUPABASE_URL` = jjangsaem-bookshop 프로젝트 URL (`https://yvuekbmidwetaulasksk.supabase.co`)
- `VITE_SUPABASE_ANON_KEY` = (설정됨)
- `ANTHROPIC_API_KEY` = (비어있음 — 로컬 `vercel dev` 쓸 때만 필요)
- 백업: `.env.firebase-backup` (기존 Firebase/Gemini 값 보관, gitignore됨)

**Vercel 프로젝트 env** (3개 모두 설정·확인 완료):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (빌드 시점), `ANTHROPIC_API_KEY` (런타임)

### Supabase 테이블
- `public.sensetrack_sessions` (id, created_at, breathing, breathing_status, breathing_change, duration, report jsonb)
- RLS: 익명 INSERT만 허용(읽기 정책 없음 → `.select()` 체이닝 금지, 현재 코드도 안 함)

### 배포 방법 / 트러블슈팅 메모
- **자동 배포**: git push → Vercel 자동 빌드(정상 동작).
- **수동 배포**: `npx vercel --prod --yes` (CLI 로그인 계정 `junominu-3970`). 14초 빌드.
- ⚠️ **이번에 겪은 이슈**: 대시보드 "Redeploy"가 `Initializing`에서 7분+ 멈춤 → **Vercel 플랫폼 일시 hiccup**(코드 무관, 같은 코드가 10~14초에 빌드됨). **CLI `vercel --prod`로 우회 배포**해서 해결. 다음에 또 멈추면 동일하게 CLI로 띄울 것.
- **로컬 개발**: `npm run dev`(vite)는 `/api` 없음 → AI는 폴백 문구, Supabase 저장은 정상. AI까지 테스트하려면 `vercel dev` 사용(+ `.env`에 `ANTHROPIC_API_KEY` 채우기).

### 헬스체크 결과 (배포 직후)
- `/` → 200 ✅
- `/api/analyze` GET → 405 ✅ (함수 배포됨)
- `/api/analyze` POST(빈 body) → 400 ✅ (= `ANTHROPIC_API_KEY` 설정 확인됨, 500 아님)

### `.env` "자물쇠" 관련 (혼동 주의)
- `.env`는 **암호화 안 됨**. **AnySign4PC**가 `.env` 확장자 연결을 가로채 더블클릭 시 암호창을 띄울 뿐. **입력할 암호 없음 → 창 닫으면 됨.**
- 편집은 VS Code나 메모장으로 직접 열기(또는 우클릭 → 연결 프로그램 변경).

---

## 다음에 할 일 (TODO)

- [ ] **kungkung·italk 도구도 SSO 합류** — 같은 jjangsaem.com 서브도메인이므로, 각 repo에 책방의 `src/lib/supabase/cookie-domain.ts` + `src/lib/auth/safe-redirect.ts` 패턴을 적용(세션 쿠키 발급 모든 곳에 `cookieOptions.domain='.jjangsaem.com'` 조건부). 같은 Supabase 프로젝트면 자동으로 SSO에 묶임. *(사용자가 별도 세션에서 진행 예정)*
- [ ] (선택) **"지난 측정 대비"를 로그인 사용자 Supabase 기록 기반으로** — 현재는 기기 localStorage. `0002`에 본인 행 SELECT 정책 이미 있으니, 로그인 시 직전 세션을 DB에서 읽어 비교하면 기기 바뀌어도 이어짐.
- [ ] (선택) **네이버 외부 복귀 매끄러움 추가 검증** — 배포 후 동작 확인됨. 엣지(팝업 차단, 세션 만료 등) 점검.
- [ ] (선택) `PROJECT_ANALYSIS.html`을 새 아키텍처 기준으로 갱신 (현재는 변경 전 스냅샷).
- [ ] (선택) 코드 정리: 미사용 `zustand` 의존성 제거, 자극 한글 매핑(`titleMap`/`nameMap`) 4곳 중복 → 상수 1곳으로, `endSession()`에서 `faceTracker.destroy()` 미호출.
- [ ] (선택) 번들 크기 경고(578KB) — MediaPipe/Chart.js 동적 import로 코드 스플리팅 고려.

### 완료됨 (이전 TODO 중)
- [x] 카카오 상담 URL 교체 → `https://open.kakao.com/o/s3YnSoni` (2026-06-11)
- [x] 전체 흐름 + 로그인 end-to-end 동작 확인 (구글·카카오·네이버·SSO·저장) (2026-06-11)

## 자주 쓰는 명령어
```bash
npm run dev            # vite 개발 서버 (AI는 폴백)
vercel dev             # /api 함수 포함 로컬 (AI까지 테스트, .env에 ANTHROPIC_API_KEY 필요)
npm run build          # 프로덕션 빌드
npx vercel --prod --yes  # CLI 수동 프로덕션 배포
npx vercel ls          # 배포 목록/상태 확인
```
