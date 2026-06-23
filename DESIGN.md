# Design

시드 단계 문서(코드 작성 전). 구현 후 실제 토큰으로 `/impeccable document`를 다시 돌려
갱신할 수 있다. 모든 색은 OKLCH로 정의하고 WCAG AA 명암비를 만족한다.

## Theme

밝은(light) 단일 테마. 순백 표면에 도구용 인디고(brand)가 위계를 만든다. 무드 한 줄:
"Linear급 도구 인디고 — 조용한 순백 위에서 상태만 또렷이 빛난다." 색 전략은 Restrained:
중립 표면 + 하나의 브랜드색 + 의미 기반 상태색만. 장식색 없음.

## Color (OKLCH)

표면·텍스트:

- `--bg`: oklch(1 0 0) — 순백 본문 배경.
- `--surface`: oklch(0.985 0.003 270) — 패널/행/카드 내부 표면(아주 옅은 쿨 그레이).
- `--border`: oklch(0.90 0.004 270) — 1px 경계선.
- `--ink`: oklch(0.22 0.02 270) — 본문/제목(대비 약 14:1, AA 통과).
- `--ink-muted`: oklch(0.46 0.02 270) — 보조 텍스트(대비 약 6:1, 본문 AA 통과).

브랜드/액션:

- `--primary`: oklch(0.42 0.18 270) — 인디고. 1차 액션·선택·포커스. 흰 텍스트 AA 통과.
- `--primary-weak`: oklch(0.55 0.10 270) — 진행률 막대 채움(보조 강조).
- `--focus-ring`: oklch(0.55 0.16 270) — 포커스 외곽선.

상태색(색 + 텍스트 라벨 병행, 배지 텍스트는 같은 계열 어두운 톤):

- 예정 todo: 채움 oklch(0.95 0.004 270) / 텍스트 oklch(0.40 0.01 270).
- 진행 in_progress: 채움 oklch(0.95 0.03 270) / 텍스트 oklch(0.40 0.15 270).
- 완료 done: 채움 oklch(0.95 0.04 150) / 텍스트 oklch(0.40 0.12 150).
- 미해결 문제/위험(보조): 텍스트 oklch(0.45 0.16 25).

## Typography

- 한 패밀리만: `system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo",
  "Noto Sans KR", sans-serif` (도구용 시스템 산세리프 + 한글 폴백).
- 고정 rem 스케일(유동 clamp 사용 안 함): h1 1.5rem/600, h2 1.125rem/600,
  과제명 0.9375rem/500, 본문 0.9375rem/400, 보조 0.8125rem/400, 마이크로(배지/%) 0.6875rem/500.
- 행간 1.5(본문), 1.3(밀집 영역). 가중치는 400/500/600만 사용.

## Components

- 큰 과제 카드: `--surface` 채움, 1px `--border`, radius 8px, 패딩 12–14px.
  내부 순서 = 과제명 → 상태 배지 + 담당 → (그 아래) 진행률 막대 + %.
- 작은/개인 과제 행: 좌측에 상태 배지·담당, 가운데 과제명, 우측에 진행률.
- 배지: radius 6px, 마이크로 타이포, 상태색 채움 + 같은 계열 어두운 텍스트.
- 진행률 막대: 높이 5px, 트랙 oklch(0.93 0.004 270), 채움 `--primary-weak`, radius 3px.
- 폼 컨트롤(select/input/checkbox/textarea): 표준 형태 유지(특이 affordance 금지),
  공통 포커스 링 `--focus-ring`. default/hover/focus/disabled 상태 모두 정의.
- 펼침 에디터: 카드/행 클릭 시 인라인 확장(모달 아님).

## Layout

- 큰 과제: `display:grid; grid-template-columns:repeat(3,1fr); gap:12px` (3×2). 좁은 화면에서
  2열→1열로 구조적 반응(유동 폰트 아님).
- 작은/개인: 세로 목록(flex column). 그룹 헤더로 구분.
- 최대 본문 폭 약 960–1040px, 좌우 24px 여백.

## Motion

- 에디터 펼침/접힘 150ms ease-out, 색/배경 전이 150ms. 페이지 로드 연출 없음.
- `@media (prefers-reduced-motion: reduce)`에서 전이 제거(즉시 전환).
