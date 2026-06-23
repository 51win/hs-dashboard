# 대시보드 v2 추가 기능 스펙

작성일: 2026-06-22
상태: 승인됨(사용자 확인 완료) → 구현 중
관련: `2026-06-22-project-dashboard-structure-design.md`(v1 구조)

사용자 확정 사항: 토큰=statusLine 자동 기록(설정 변경 OK), 토큰 보기=전체 추이+과제별
둘 다, 오늘 탭=오늘 기한·오늘 완료·이번 주 기한, 기한 임박 시 빨간색 + D-5 형태 표시.

## 1. 데이터 모델 확장

### Task
- `name` 편집 가능(에디터에 이름 입력 필드 추가).
- `tokens: TokenEntry[]` 활용 — 과제별 토큰(수동/예상 입력). `TokenEntry = {date, tokens:number, estimated:boolean, note}`.

### ChecklistItem (확장)
```
{ id, text, note, done:boolean, importance:'high'|'mid'|'low', due:'YYYY-MM-DD'|'', doneAt:'YYYY-MM-DD'|'' }
```
- `note`: 항목별 간단한 설명.
- `due`: 기한(없으면 빈 문자열).
- `doneAt`: 완료 처리된 날짜. `done`을 true로 토글하면 오늘 날짜 기록, false로 토글하면 `''`로 초기화.
- 진행률 계산(가중치 상3/중2/하1)은 v1 그대로. `note/due/doneAt`는 진행률에 영향 없음.

## 2. 탭 구조

상단 탭 3개(그룹 선택 아님): `대시보드` / `오늘` / `토큰`. 클릭 시 해당 뷰만 렌더.
기본 탭 = 대시보드. 탭 상태는 모듈 변수로 유지(`_tab`).

## 3. 편집(에디터) 변경

과제 펼침 편집에 추가:
- 과제 이름 입력(`input.name-input`).
- 체크리스트: `+ 항목 추가` 버튼(`button.cl-add`), 항목 삭제(`button.cl-del[data-item-id]`).
- 각 항목: 체크박스 + 텍스트 + 중요도 select + 설명 입력(`input.cl-note`) + 기한 입력(`input.cl-due` type=date).
- 과제별 토큰: 간단 입력(날짜+토큰수, `estimated` 체크) 추가/표시(과제별 비교 그래프 소스).

규칙(v1 계승): 변경 시 자동 저장(localStorage) + 재렌더 후 해당 에디터 다시 펼침.

## 4. "오늘" 탭

기준 날짜 = 로컬 오늘(YYYY-MM-DD). 모든 과제의 체크리스트를 가로질러 모은다.
세 구획:
- `오늘 할 일`: `due === today && !done`.
- `오늘 완료`: `doneAt === today`.
- `이번 주 기한`: `today <= due <= 이번 주 일요일 && !done`(오늘 포함, 오늘 항목과 중복 표시 허용).

각 항목 표시: 소속 과제명 + 항목 텍스트 + D-day 배지.
- D-day: `due - today`(일수). `D-5`(5일 남음), `D-DAY`(오늘), `D+3`(3일 지남).
- 색: 지났거나(`due < today`) 임박(`0 <= 남은일수 <= 2`)이면 위험색(빨강 계열 `--risk-ink`).

순수 함수로 분리(테스트 대상):
- `Dashboard.todayStr()` → 'YYYY-MM-DD'(로컬).
- `Dashboard.ddayLabel(due, today)` → 'D-5' | 'D-DAY' | 'D+3' | ''(due 없음).
- `Dashboard.isUrgent(due, today)` → boolean(지남 또는 0~2일).
- `Dashboard.collectToday(data, today)` → `{ dueToday:[], doneToday:[], dueThisWeek:[] }`. 각 원소 `{taskId, taskName, item}`.

## 5. "토큰" 탭

라이브러리 없이 SVG로 2개 그래프:
- 전체 추이(라인/막대): 날짜별 총 토큰. 데이터 소스 = `window.DASHBOARD_TOKENS`(statusLine이 생성하는 사이드카) + 비어있으면 빈 상태 안내.
- 과제별 비교(막대): 각 과제 `tokens[]` 합계.

순수 함수:
- `Dashboard.taskTokenTotal(task)` → number(Σ tokens).
- `Dashboard.dailyTokenSeries()` → `[{date, tokens}]`(window.DASHBOARD_TOKENS.daily 정렬, 없으면 []).

## 6. statusLine 자동 기록 (브리지)

브라우저(file://)는 외부 로그를 fetch 불가(CORS) → **사이드카 스크립트 파일**로 연결.

- `tools/statusline.mjs`(Node): Claude Code가 stdin으로 주는 JSON 수신. `transcript_path` JSONL을
  읽어 assistant 메시지들의 `usage`(input+output+cache) 합 = 세션 누적 토큰 계산.
  `cost.total_cost_usd`도 사용. 로그에 스냅샷 append 후, 대시보드 폴더에
  `dashboard-tokens.js` 재생성: `window.DASHBOARD_TOKENS = { generatedAt, daily:[{date,tokens,cost}] }`.
  (날짜별 = 세션별 누적의 최댓값을 세션마다 취해 합산 → 중복 카운트 방지.)
  stdout으로는 짧은 상태문자열(예: 토큰/비용) 출력해 statusLine 본연 역할도 수행.
- `dashboard.html`은 `<script src="dashboard-tokens.js"></script>`를 선택적으로 로드(없어도 에러 없음, 가드).
- 설정: `~/.claude/settings.json` 또는 프로젝트 `.claude/settings.json`의 `statusLine.command`로 스크립트 지정.
- 한계(명시): statusLine은 어떤 "과제"인지 알 수 없으므로 **과제별 토큰은 자동 불가** → 과제별은 수동 입력.
  전체 추이만 자동.

## 7. 테스트(jsdom) 추가

- 체크리스트: 추가/삭제, note·due 설정, done 토글 시 doneAt 기록/해제.
- 이름 편집 반영.
- todayStr/ddayLabel/isUrgent/collectToday/taskTokenTotal/dailyTokenSeries 단위 테스트.
- 탭 전환 렌더(대시보드/오늘/토큰) DOM 확인.
- window.DASHBOARD_TOKENS 있을 때 전체 추이 그래프에 데이터 포인트 렌더.

## 8. 범위 밖(후속)

과제별 토큰 자동 귀속, 토큰 예산/알림, 시트 백엔드 연동.
