# 대시보드 v3 변경 스펙

작성일: 2026-06-22
상태: 승인됨(사용자 요청) → 구현 중
관련: v2(`2026-06-22-dashboard-v2-features.spec.md`)

## 1. 탭 통합 — 랜딩에 "오늘" 노출

- `대시보드`/`오늘` 분리 제거. 탭은 **2개**: `대시보드`(기본) / `토큰`.
- `대시보드` 진입 즉시 상단에 "오늘 해야 할 것"(오늘 할 일 / 오늘 완료 / 이번 주 기한)이
  먼저 보이고, 그 아래 큰 과제 그리드·작은 과제·개인이 이어진다.
- `토큰` 탭은 유지(전체 추이 + 과제별 비교).

## 2. 작은 과제 = 체크리스트

- 작은 과제 그룹은 "과제 안에 체크리스트"가 아니라, **과제 자체가 체크 항목**.
- 작은 과제 그룹은 평평한 체크리스트로 렌더: 각 행 = 체크박스(완료) + 이름(인라인 편집) +
  기한(date) + D-day 배지 + 삭제. 하단에 `+ 작은 과제 추가`.
- 모델: 작은 과제(Task)는 과제 수준 `due`, `doneAt`를 가진다(`note`는 선택). 체크 토글 시
  `status`가 `done`↔`todo`로 바뀌고 `doneAt`이 오늘/'' 로 설정. 진행률은 기존 폴백대로
  완료 100% / 미완 0%.
- "오늘" 집계(`collectToday`)는 작은 과제를 **항목처럼** 포함(텍스트=이름, 기한=due,
  완료=status==='done', doneAt). taskName 표기는 "작은 과제".

## 3. 저장 버튼

- 큰 과제·개인 과제 편집 패널에 `저장` 버튼 추가. 클릭 시 저장 + 재렌더 → 카드 제목 등
  변경이 즉시 반영(새로고침 불필요). 편집 패널은 다시 펼친 상태 유지.
- 작은 과제 행은 체크/기한 변경 시 즉시 재렌더되어 반영, 이름은 입력 즉시 저장.

## 4. 신규/변경 함수

- `setTaskDue(data, taskId, due)`
- `addSmallTask(data)` → 새 작은 과제 생성, 새 id 반환
- `removeTask(data, taskId)`
- `toggleSmallDone(data, taskId)` → status done↔todo + doneAt
- `collectToday` 확장(작은 과제 포함)

## 5. 테스트

- 기존 v2 `setTab` 테스트를 2탭 구조로 갱신(대시보드에 grid6 + "오늘 할 일" 동시 표시).
- 추가: addSmallTask/removeTask/toggleSmallDone/setTaskDue, collectToday가 작은 과제 due를
  버킷에 포함, 저장 버튼(.save-btn) 존재, 작은 과제 렌더(.small-row/.sm-add).
