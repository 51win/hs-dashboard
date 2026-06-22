# 구글 시트(읽기 전용) + GitHub Pages 설정

대시보드를 GitHub Pages(https)에 올리고, 공개 구글 시트를 데이터 원본으로 읽어 표시합니다.
편집은 구글 시트에서 하고, 대시보드는 읽기 전용으로 보여줍니다.

## 1. 구글 시트 만들기

1. 새 구글 시트를 만들고 탭 두 개를 둡니다: `Tasks`, `Checklist`.
2. 이 저장소 `sheets-migration/`의 CSV를 각 탭으로 가져옵니다.
   - 구글 시트 → 파일 → 가져오기 → 업로드 → `Tasks.csv` → "현재 시트 바꾸기"(Tasks 탭에서).
   - 같은 방법으로 `Checklist.csv` → Checklist 탭.
3. 열 이름(첫 행)은 그대로 유지하세요:
   - Tasks: `id, group, name, status, owner, due, doneAt, memo`
     - group = `team_goal` | `small` | `personal`, status = `todo` | `in_progress` | `done`
   - Checklist: `taskId, id, text, note, importance, done, due, doneAt`
     - importance = `high` | `mid` | `low`, done = `TRUE` | `FALSE`, 날짜 = `YYYY-MM-DD` 또는 빈칸

## 2. 시트 공개(링크 보기)

- 우상단 "공유" → "링크가 있는 모든 사용자"를 **뷰어**로 설정.
- 시트 ID는 URL에서: `https://docs.google.com/spreadsheets/d/<여기가_시트_ID>/edit`.

대시보드는 아래 형식의 gviz CSV로 각 탭을 읽습니다(공개 시트, CORS 허용):

```
https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&sheet=Tasks
https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&sheet=Checklist
```

## 3. GitHub Pages에 올리기

1. 이 폴더를 GitHub 저장소로 push:
   ```bash
   git remote add origin https://github.com/<아이디>/<저장소>.git
   git push -u origin master   # 또는 main
   ```
2. GitHub 저장소 → Settings → Pages → Source = `Deploy from a branch`,
   Branch = `master`(또는 `main`) / `/ (root)` → Save.
3. 몇 분 뒤 `https://<아이디>.github.io/<저장소>/dashboard.html` 로 열립니다.

> file://(로컬 파일)에서는 브라우저가 외부 fetch를 막아 시트 읽기가 동작하지 않습니다.
> 시트 연동은 반드시 https(Pages) 에서 사용하세요. 로컬에서는 기존 편집 모드로 동작합니다.

## 4. 대시보드에서 시트 연결

- Pages URL로 대시보드를 연 뒤, 상단 "데이터 소스"에서 시트 ID를 붙여넣고 연결.
- 연결되면 읽기 전용 모드로 전환되어 시트 데이터를 표시합니다(편집 UI 숨김).
- "새로고침"으로 최신 시트 내용을 다시 불러옵니다. 해제하면 로컬 편집 모드로 돌아갑니다.

## 5. 토큰(statusLine)과의 관계

- 토큰 그래프는 시트가 아니라 `dashboard-tokens.js`(statusLine 사이드카)에서 옵니다.
- Pages에 올릴 때 이 파일도 함께 push하면 공개 대시보드에서도 토큰 추이가 보입니다.
  (자동 갱신은 로컬에서 statusLine이 파일을 갱신 → push 시 반영.)

## 6. 한계 / 다음 단계

- 현재는 읽기 전용. 대시보드에서 직접 시트에 쓰기(편집자 OAuth 로그인)는 후속 작업.
- 실시간 푸시는 아니며, 로드/새로고침(또는 짧은 폴링) 기반입니다.
