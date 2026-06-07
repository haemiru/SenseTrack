# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**SenseTrack (`sensetrack-ai`)** — 다감각(후각·청각) 자극에 대한 사람의 반응을 웹캠과 마이크로 실시간 추적·분석하는 웹 앱.

- 사용자가 향(라벤더, 오렌지 등)이나 소리(싱잉볼)를 제시하고 "자극 적용" 버튼을 누르면,
  MediaPipe 얼굴 랜드마크 + Web Audio API로 반응 시간·호흡 안정도·고개 움직임·발성을 측정한다.
- 세션 종료 시 Chart.js 그래프와 자극별 반응 통계가 담긴 리포트를 만들고, Claude(Anthropic) AI가 전문가 의견을 생성한다.
- 리포트는 Supabase(Postgres)에 저장하고, 카카오 오픈채팅으로 전문가 상담을 연결한다.
- UI 언어는 **한국어**. 발달장애 아동 등의 감각 반응 측정/웰니스 용도로 보인다.

> 이 디렉토리는 상위 `C:\Users\bsuha\Claude-prj\CLAUDE.md`가 설명하는 멀티프로젝트 저장소와 별개의 독립 git 저장소다 (그 파일에는 SenseTrack이 나오지 않는다).

## 명령어

루트 디렉토리에서 실행:

```bash
npm install      # 의존성 설치
npm run dev      # Vite 개발 서버 (포트 5173, host: true → LAN 접근 가능)
npm run build    # 프로덕션 빌드 → dist/ (target: esnext)
npm run preview  # 빌드 결과 미리보기
```

테스트 러너·린터·포매터는 설정되어 있지 않다.

## 기술 스택

- **빌드**: Vite 6 (바닐라 JS, 프레임워크 없음 / ES Module)
- **비전**: `@mediapipe/tasks-vision` — Face Landmarker (478 랜드마크 + 블렌드쉐이프), WASM·모델은 CDN에서 로드
- **오디오**: Web Audio API (AnalyserNode, FFT)
- **차트**: `chart.js` (line, 그라데이션 영역)
- **AI**: `@anthropic-ai/sdk` (Claude Opus 4.7, `claude-opus-4-7`) — **Vercel 서버리스 함수에서만** 호출
- **DB**: `@supabase/supabase-js` (Postgres `sensetrack_sessions` 테이블, 브라우저에서 anon key로 INSERT)
- `zustand`가 의존성에 있으나 현재 코드에서는 미사용

> Supabase는 기존 **jjangasem-bookshop** 프로젝트를 공유한다. 따라서 SenseTrack이 만드는 모든 테이블에는 **`sensetrack_` prefix가 필수**다.

## 아키텍처

엔트리 `index.html`(전체 UI 마크업) → `src/main.js`가 모든 모듈을 연결한다. 상태 라이브러리 없이
`SenseTrackApp` 클래스 하나가 DOM 캐싱·이벤트·렌더링을 담당하고, 도메인 로직은 모듈로 분리되어 있다.

| 파일 | 역할 |
|------|------|
| `src/main.js` | `SenseTrackApp` 컨트롤러. 카메라/오디오 토글, 분석 루프(`requestAnimationFrame`), UI 갱신, 리포트 렌더링 |
| `src/mediapipe/faceTracker.js` | `FaceTracker`. MediaPipe 초기화(GPU→CPU 폴백), 프레임 처리, 고개 각도(Yaw/Pitch) 계산, 메쉬 드로잉. EMA 스무딩 |
| `src/mediapipe/audioAnalyzer.js` | `AudioAnalyzer`. 마이크 RMS→dB 변환, 발성 감지, 시각화 바. EMA 스무딩 |
| `src/session/sessionManager.js` | `SessionManager`. 타이머, 자극 활성화/반응 감지(baseline 대비 변화량), 데이터 수집, 리포트 생성 |
| `src/session/aiAnalyzer.js` | `AIAnalyzer`. 세션 데이터를 `/api/analyze`(Vercel 함수)로 POST → Claude 전문가 의견 수신. 브라우저에서 Claude를 직접 호출하지 않음(키 보호) |
| `api/analyze.js` | **Vercel 서버리스 함수**. `@anthropic-ai/sdk`로 `claude-opus-4-7` 호출(adaptive thinking, effort medium). 프롬프트 구성·응답 텍스트 추출. `ANTHROPIC_API_KEY`는 서버 환경변수 |
| `src/supabase.js` | Supabase 클라이언트 + `saveSessionReport()` → `sensetrack_sessions` INSERT |
| `supabase/migrations/0001_sensetrack_sessions.sql` | 테이블 + RLS(익명 INSERT 허용) 정의 |
| `src/styles/index.css` | 디자인 시스템(CSS 변수)·전체 스타일 (~1270줄, config 파일 없음) |
| `stitch_assets/` | Google Stitch로 만든 디자인 목업 HTML/스크린샷 (참고용, 빌드 비포함) |

### 핵심 데이터 흐름

1. `startCamera()` → getUserMedia(video) + `audioAnalyzer.initialize()`(audio) + `sessionManager.start()`
2. `startAnalysisLoop()`가 매 프레임: `faceTracker.detectForVideo()` → `analyzeResults()` → 콜백으로
   `sessionManager.recordFaceData()` + UI 갱신, 그리고 `audioAnalyzer.getAnalysis()` → `recordAudioData()`
3. "자극 적용" → `activateStimulus()`로 `awaitingReaction=true`. 적용 직후 0.5초는 쿨타임 겸 baseline 측정,
   이후 baseline 대비 yaw/pitch/mouth/brow/smile 변화가 임계값을 넘으면 반응으로 기록(반응 시간 = 경과 초)
4. "측정 종료" → `sessionManager.end()` → `generateReport()` → 리포트 시트 표시 →
   비동기로 `aiAnalyzer.generateExpertInsight()`(→ `fetch('/api/analyze')` → Claude) → "저장" 시 `saveSessionReport()`(→ Supabase). AI 호출 실패 시 `report.recommendation` 정적 문구로 폴백

### 측정 로직 주의점

- **호흡 안정도**는 전용 센서가 아니라 입 움직임(`jawOpen`)과 눈 깜빡임 패턴으로 **추정**한 값이다 (`recordFaceData`).
- **반응 감지**는 얼굴/머리 움직임의 변화량 기반 휴리스틱이다. 절대값이 아닌 baseline 대비 변화로 판정한다.
- 고개 각도는 랜드마크 거리 비율로 근사한 간이 계산이며 EMA(0.3/0.7)로 스무딩한다.

## 환경 변수 (`.env`)

`.env.example` 참조. `.env*`는 gitignore 처리됨.

- **브라우저용** (`import.meta.env.VITE_*`, 번들에 포함됨 = 공개):
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — 기존 jjangasem-bookshop 프로젝트 값
- **서버 사이드 전용** (`VITE_` 접두어 금지, `process.env`):
  - `ANTHROPIC_API_KEY` — Vercel 환경변수에 설정. 로컬에서 `vercel dev`로 `/api` 함수를 테스트할 때만 `.env`에 둔다. **절대 `VITE_`를 붙이지 말 것**(붙이면 브라우저 번들에 노출).

## 배포

- **Vercel** (`.vercel/project.json`, projectName `sense-track`). Vite 정적 빌드 + `/api` 서버리스 함수.
- `/api/analyze.js`는 Vercel이 Node 서버리스 함수로 자동 배포. `ANTHROPIC_API_KEY`를 Vercel 프로젝트 환경변수에 등록해야 동작.
- **로컬 개발**: `npm run dev`(vite)만 쓰면 `/api`가 없어 AI 분석은 폴백 문구로 표시된다. AI까지 테스트하려면 `vercel dev` 사용.
- **DB 마이그레이션**: `supabase/migrations/0001_sensetrack_sessions.sql`을 Supabase SQL Editor에서 실행(또는 `supabase db push`).
- MediaPipe WASM/모델과 Google Fonts·Material Symbols를 CDN에서 로드하므로 런타임에 외부 네트워크 필요.

## 작업 시 관례

- 프레임워크 비종속(바닐라) 설계 — 모듈은 콜백(`onResult`, `onTimerUpdate` 등)으로 느슨하게 결합. `faceTracker.js` 주석상 향후 React Native 이식 고려.
- DOM은 `cacheDom()`에서 한 번에 캐싱 후 `this.dom.*`로 사용.
- 자극 이름 한글 매핑(`titleMap`/`nameMap`)이 `main.js` 여러 곳에 중복되어 있다 — 자극 추가 시 모두 갱신 필요.
