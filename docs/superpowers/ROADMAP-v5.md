# v5 로드맵 — 구글 시트 = DB, 뷰어/관리자 대시보드 (상세)

목표 최종 모습:
- 구글 시트가 데이터 원본(DB).
- 대시보드 **뷰어 모드**(비로그인/공개) = 읽기 전용.
- 대시보드 **관리자 모드**(로그인) = 대시보드 안에서 직접 수정 → 시트에 반영(쓰기).
- GitHub Pages(https)에 호스팅, 토큰 추이는 statusLine 사이드카로 표시.

범례: 🧑 = 한승이 준비, 🤖 = 내가 구현, ✅ = 완료 기준.

---

## 1단계 — 구글 시트 생성·공개 🧑

무엇을: 데이터의 DB가 될 시트를 만들고 공개 읽기로 연다.

1. 구글 드라이브에서 새 스프레드시트 생성. 탭 두 개로 이름 변경: `Tasks`, `Checklist`.
2. CSV 가져오기:
   - 파일 → 가져오기 → 업로드 → `sheets-migration/Tasks.csv` → 위치 "현재 시트 바꾸기"(Tasks 탭 선택 상태).
   - 같은 방식으로 `Checklist.csv` → Checklist 탭.
3. 첫 행(헤더) 이름을 그대로 유지:
   - Tasks: `id, group, name, status, owner, due, doneAt, memo`
     - group=`team_goal|small|personal`, status=`todo|in_progress|done`, 날짜=`YYYY-MM-DD` 또는 빈칸
   - Checklist: `taskId, id, text, note, importance, done, due, doneAt`
     - importance=`high|mid|low`, done=`TRUE|FALSE`
4. 공유: 우상단 "공유" → "링크가 있는 모든 사용자"를 **뷰어**로.
5. URL에서 시트 ID 확보: `.../spreadsheets/d/<여기가_SHEET_ID>/edit`.

✅ 완료 기준: 브라우저에서 아래가 CSV로 열림
`https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&sheet=Tasks`

---

## 2단계 — GitHub Pages 배포 🧑(+🤖 지원)

무엇을: 대시보드를 https로 띄운다. (구글 fetch·OAuth는 file://에서 막히므로 필수)

1. GitHub에 빈 저장소 생성(예: `hs-dashboard`).
2. 로컬에서 원격 연결 후 push:
   ```bash
   cd <HS_Dashboard 경로>
   git remote add origin https://github.com/<아이디>/<저장소>.git
   git push -u origin master   # 기본 브랜치가 main이면 main
   ```
3. 저장소 → Settings → Pages → Source=`Deploy from a branch`,
   Branch=`master`(또는 `main`) / 폴더 `/(root)` → Save.
4. 1~2분 뒤 공개 URL 확인: `https://<아이디>.github.io/<저장소>/dashboard.html`.

🤖 지원: 원격 추가/푸시 명령, `.gitignore` 점검, 빌드 없는 정적 배포라 추가 설정 불필요함을 확인.

✅ 완료 기준: 위 URL이 https로 대시보드를 표시.

---

## 3단계 — 뷰어 모드 연결·검증 🤖(코드는 이미 구현, 실데이터 확인만)

무엇을: 공개 시트를 읽어 표시하는 읽기 전용 모드를 실제 시트로 확인.

1. Pages URL로 대시보드 열기 → 상단 "데이터 소스"에 1단계의 SHEET_ID 입력 → 연결.
2. 동작: 시트의 Tasks/Checklist를 gviz CSV로 읽어 큰 과제 그리드·작은 과제·개인·오늘 패널 렌더.
   편집 UI(에디터/추가/저장/가져오기)는 숨겨지고, "공개 시트에서 읽는 중 · 마지막 동기화 · 새로고침" 배너 표시.
3. 시트에서 값을 바꾸고 대시보드 "새로고침" → 반영 확인.

이미 구현된 것: `parseCsv`, `parseSheetData`, `sheetCsvUrl`, `loadFromSheet`, 읽기 전용 렌더, 설정 저장.
이 단계는 코드 작성이 아니라 실제 공개 시트로 동작을 확인하는 검증 단계.

✅ 완료 기준: 시트 수정 → 새로고침 시 대시보드 반영. file://이 아닌 https에서 정상.

---

## 4단계 — 쓰기(관리자) 방식 결정 🧑🤖 (의사결정)

관리자가 대시보드에서 시트에 쓰는 방법을 택한다. 한 가지를 골라야 5단계로 진행.

옵션 A — Google OAuth + Sheets API (권장)
- 흐름: 관리자 Google 로그인(편집 권한) → 토큰으로 Sheets API `values.update/append` 호출.
- 필요: Google Cloud 프로젝트 + OAuth 클라이언트 ID(웹), 승인된 JS 출처=Pages URL.
- 장점: 구글 권한 모델 그대로(편집자만 쓰기), 추가 서버 없음.
- 단점: Google Cloud 설정·동의 화면 준비 필요.

옵션 B — Apps Script 웹앱 엔드포인트
- 흐름: 시트에 붙인 Apps Script `doPost`가 쓰기를 대행. 대시보드는 그 URL로 POST.
- 장점: OAuth 클라이언트 ID 불필요, 설정이 단순.
- 단점: 엔드포인트 별도 배포·보호 필요(비밀 키/허용 출처), 권한이 "스크립트 소유자" 기준.

추가 결정: 관리자 판별을 "로그인 사실만"으로 할지, 별도 허용 목록(이메일 화이트리스트)을 둘지.

✅ 완료 기준: A 또는 B 선택 + 관리자 판별 방식 확정. (A면 Google Cloud OAuth 클라이언트 ID 준비)

---

## 5단계 — 관리자 로그인 구현 🤖

무엇을: 로그인 상태에서만 편집이 열리도록 모드를 분리.

1. 인증 붙이기(4단계 선택에 따라):
   - A: Google Identity Services로 로그인 → 액세스 토큰 보관(메모리/세션).
   - B: 간단한 관리자 표식(예: 키 입력/허용된 계정) + 엔드포인트 호출 권한.
2. 모드 게이팅: 기본=뷰어(읽기 전용). "관리자 로그인" 성공 시 편집 UI(에디터·추가·저장·작은 과제 추가/삭제) 노출.
3. 상태 표시: 헤더에 로그인/로그아웃, 현재 모드 배지.

✅ 완료 기준: 비로그인=읽기 전용, 로그인=편집 UI 노출. 로그아웃 시 뷰어 복귀.

---

## 6단계 — 대시보드 → 시트 쓰기 구현 🤖

무엇을: "저장"이 시트에 실제로 반영되게 한다.

1. 역매핑 순수 함수: 현재 데이터(그룹·과제·체크리스트) → 시트 행 배열(Tasks/Checklist 스키마). 단위 테스트 대상.
2. 쓰기 호출:
   - A: Sheets API `spreadsheets.values.update`(전체 갱신) 또는 행 단위 update/append.
   - B: Apps Script `doPost`에 변경분 전송.
3. 단순 전략부터: "현재 상태 전체를 시트에 덮어쓰기"(낙관적) → 이후 행 단위 최적화.
4. 결과 피드백: 성공/실패 토스트, 실패 시 로컬 보존 + 재시도 안내.

✅ 완료 기준: 대시보드에서 수정·저장 → 구글 시트에 반영 확인. 데이터→행 매핑 테스트 통과.

---

## 7단계 — 모드 전환·세션·예외 처리 🤖

무엇을: 실사용에서 깨지지 않게 다듬는다.

1. 뷰어↔관리자 전환, 토큰 만료/로그아웃 처리.
2. 동시편집/충돌: 우선 "로드 후 저장 + 새로고침" 기준(실시간 공동편집은 시트 자체에서).
3. 오프라인/네트워크 오류: 배너·재시도, 로컬 캐시 폴백.
4. 권한 오류(편집 권한 없는 계정이 저장 시도) 메시지.

✅ 완료 기준: 로그인/로그아웃/오류 시 적절한 안내와 복구. 데이터 유실 없음.

---

## 8단계 — 검증·배포 🤖(+🧑 확인)

1. 헤드리스 테스트(jsdom) 전체 통과: 파싱·역매핑·모드 게이팅 단위 테스트.
2. Pages 재배포(push) 후 실제 URL에서 점검:
   - 뷰어(비로그인): 읽기 전용 정상.
   - 관리자(로그인): 편집·저장 → 시트 반영.
3. 토큰 탭: 사이드카 갱신 반영(로컬 statusLine → push 시 공개에도 반영).

✅ 완료 기준: 뷰어/관리자 양쪽 실제 동작 + 테스트 그린 + 배포 완료.

---

## 의존성 요약

- 지금 막힌 것: (a) 1·2단계 시트 생성·Pages 배포(한승 준비), (b) 4단계 쓰기 방식 결정.
- 이 둘이 정해지면 5~8단계는 내가 이어서 구현 가능.
- 참고 문서: `tools/SHEETS_AND_PAGES.md`(설정), `docs/superpowers/specs/2026-06-22-dashboard-v5-roles-backlog.spec.md`(설계 배경).
