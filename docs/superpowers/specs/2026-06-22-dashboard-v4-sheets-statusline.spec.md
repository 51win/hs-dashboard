# 대시보드 v4: 구글 시트(읽기 전용) + statusLine 연동 스펙

작성일: 2026-06-22
상태: 승인됨(사용자 선택) → 구현 중
사용자 확정: 시트=읽기 전용(공개 시트를 대시보드가 읽어 표시), 호스팅=GitHub Pages,
statusLine=이 폴더 `.claude/settings.json`에 자동 설정.

## 1. statusLine 토큰 연동 (완료)

- `.claude/settings.json`에 `statusLine.command = node "$CLAUDE_PROJECT_DIR/tools/statusline.mjs"`.
- `tools/statusline.mjs`가 세션 transcript에서 토큰을 합산해 `dashboard-tokens.js`(사이드카)를
  갱신 → 대시보드 "토큰" 탭의 전체 추이 그래프에 자동 반영.
- 실시간성: statusLine은 메시지마다 갱신. 대시보드는 토큰 탭에 **자동 새로고침(폴링)**과
  수동 새로고침 버튼을 추가해 사이드카 변화를 반영(파일 재주입 방식).
- 전제: 이 폴더에서 Claude Code 실행 + 워크스페이스 신뢰(trust) 수락.

## 2. 구글 시트 읽기 전용 연동

### 2.1 방향
공개(링크 보기 권한) 구글 시트를 **데이터 원본**으로 두고, 대시보드(호스팅: GitHub Pages,
https)가 시트를 읽어 표시. 편집은 구글 시트에서. 열람자는 로그인 불필요.

### 2.2 시트 스키마(탭/열)
- `Tasks` 탭: `id, group, name, status, owner, due, doneAt, memo`
  - group ∈ {team_goal, small, personal}; status ∈ {todo, in_progress, done}; 날짜 = YYYY-MM-DD 또는 빈칸.
- `Checklist` 탭: `taskId, id, text, note, importance, done, due, doneAt`
  - importance ∈ {high, mid, low}; done ∈ {TRUE/FALSE}.
- 토큰은 시트가 아니라 statusLine 사이드카에서 옴(과제별 토큰은 수동 입력 유지).

### 2.3 읽기 방식
- gviz CSV 엔드포인트(공개 시트, CORS 허용): 
  `https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&sheet=<TabName>`
- 대시보드가 `Tasks`/`Checklist` 두 탭을 fetch → CSV 파싱 → 데이터 모델로 변환 → 렌더.

### 2.4 동작/모드
- 설정 저장: localStorage `dashboard-sheet-id`(시트 ID). 헤더에 "데이터 소스" 컨트롤(연결/해제).
- 시트 연결 시 = **읽기 전용 모드**: 시트에서 로드해 렌더, 편집 UI(에디터/추가/저장/가져오기) 숨김,
  상단에 배지("공개 시트에서 읽는 중 · 마지막 동기화 시각 · 새로고침").
- 미설정/로드 실패 시 = 기존 **로컬 편집 모드**(localStorage/seed)로 폴백(에러 배너 후).
- 토큰 탭은 두 모드 모두 사이드카에서 동작.

### 2.5 순수 함수(테스트 대상)
- `sheetCsvUrl(sheetId, tab)` → URL 문자열.
- `parseCsv(text)` → 셀 2차원 배열(따옴표/콤마/개행 처리).
- `parseSheetData(tasksCsv, checklistCsv)` → `{version:1, groups, tasks}`(고정 3그룹, group→groupId 매핑,
  done 문자열→boolean, 누락 필드 기본값).
- `setSheetId(id)/getSheetId()/clearSheetId()` 설정 접근자.

## 3. GitHub Pages 호스팅

- 이 저장소를 GitHub에 push → Settings > Pages에서 배포. 산출물은 정적(단일 html + 사이드카).
- 공개 URL에서 https로 동작 → gviz fetch 정상. (file://에서는 fetch가 막혀 로컬 모드만.)
- 시트는 "링크가 있는 모든 사용자: 뷰어"로 공유(또는 웹에 게시).
- 상세 절차는 `tools/SHEETS_AND_PAGES.md`.

## 4. 데이터 이관(마이그레이션)

현재 시드/로컬 데이터를 `sheets-migration/Tasks.csv`, `Checklist.csv`로 생성 → 사용자가
구글 시트 탭으로 가져오기.

## 5. 테스트(jsdom)

- parseCsv: 따옴표 안 콤마/개행, 빈 셀.
- parseSheetData: Tasks/Checklist CSV → 3그룹 + 과제 + 체크리스트, done boolean, group 매핑.
- sheetCsvUrl 형식.
- 읽기 전용 모드: setSheetId 후 렌더 시 편집 컨트롤(.save-btn/.cl-add/.sm-add) 미표시 + 배지 표시
  (네트워크 없이 주입된 데이터로 검증).

## 6. 범위 밖(후속)

쓰기(편집자 OAuth), 실시간 푸시, 권한 세분화.
