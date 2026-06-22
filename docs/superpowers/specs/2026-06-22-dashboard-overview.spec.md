# 프로젝트 대시보드 — 종합 정리 (Overview & Handoff Spec)

작성일: 2026-06-22
목적: 지금까지 결정·구현한 내용을 한 곳에 정리. **새 세션/탭에서 시각화 구현을
이어갈 때 이 문서를 기준으로 진행한다.**

## 1. 한 줄 요약

AI/에이전트 프로젝트 작업을 추적하는 대시보드. 프로젝트 → 과제 구조로 계획·진행률·
체크리스트·문제점·토큰 사용량을 기록·시각화한다.

## 2. 현재 구현 상태 (완료)

파일: `dashboard.html`(단일 파일, 외부 의존성 없음·오프라인 동작), `dashboard-data.json`(데이터).

- 저장: File System Access API로 JSON 자동저장 + localStorage 백업 + 내보내기/가져오기.
  Claude도 같은 JSON을 직접 읽고 수정 가능("둘 다 편집").
- 데이터 모델: 프로젝트 → 과제. 과제는 상태·진행률·체크리스트·문제점·토큰기록·메모.
- 화면: 개요 요약 카드(프로젝트/과제·상태별/진행률/토큰총합/미해결문제),
  과제별 토큰 막대, 토큰 추이(일별 21일·주간 12주, SVG), 프로젝트/과제 펼침 편집.
- 검증: 헤드리스(jsdom) 테스트로 렌더·집계·추가/편집/삭제·자동저장·차트 확인 완료.

데이터 모델 상세는 `2026-06-22-project-dashboard-design.md` 참조.

## 3. 확정된 방향 (백엔드·권한)

향후 공유·권한이 필요할 때의 진화 경로. 상세는 `2026-06-22-sheets-backend-and-permissions.spec.md`.

- 데이터 원본 = **Google Sheets**. 권한은 구글 공유 모델로 강제.
- 공유: 소수 편집자 + 다수 열람자.
- 편집: 대시보드 + Google Sheets 양쪽. 대시보드 편집은 **편집자 OAuth 로그인** 필요.
- 열람자: **로그인 없음 = 공개 읽기**. 데이터 공개 가능 확인됨.
- 호스팅: **GitHub Pages**.
- 실시간: 푸시 아님. 로드/새로고침 기반(+선택적 30~60초 폴링). 시트 내 편집자끼리는
  구글 실시간 공동편집.

시트 매핑(탭): `Projects, Tasks, Checklist, Issues, Tokens` (정규화, 외래키 task_id/project_id).
현재 데이터 이관 CSV는 `sheets-migration/` 폴더에 생성됨.

## 4. 시각화 계획 (미구현, 제안됨)

상세는 `2026-06-22-dashboard-visualization.spec.md`. 항목:

- 프로젝트 필터(차트·목록을 특정 프로젝트로 한정).
- 상태 필터 / 이름 검색.
- 추가 차트: 상태별 비율 도넛, 프로젝트 간 토큰 비교, 누적 토큰 추이(라인).
- 토큰 예상량 기록 규칙(추정 기준 — 사용자 입력 대기, 메모에 `(예상)` 표기).

모든 시각화는 외부 라이브러리 없이 SVG/CSS로 구현(오프라인 유지).

## 5. 작업 방식 (규칙)

- HTML을 직접 수정하기 전에 `.spec.md`에 계획 → 사용자 확인 → 구현 → 헤드리스 검증.
- 계획 항목 상태: `제안됨` → `승인됨` → `구현됨`.
- 토큰 자동 기록은 실측 불가 → 예상량(추정치). 정확값은 콘솔/직접 입력.

## 6. 다음 단계 (새 세션에서 이어갈 작업)

권장 순서:

1. 시트 생성 + CSV 5개를 탭으로 가져오기(`sheets-migration/`). 시트를 공개 읽기로 게시.
2. 읽기 전용 대시보드(2단계): 공개 시트를 읽어 요약·차트 렌더(열람자용, 무로그인).
3. 시각화 계획 항목 중 우선순위 골라 구현(프로젝트 필터/상태 필터/추가 차트).
4. 편집 기능(3단계): GitHub Pages 배포 + Google OAuth 클라이언트 ID → 편집자 로그인 편집.

전제(사용자 준비): GitHub 저장소, Google Cloud OAuth 클라이언트 ID(승인 원본 = Pages URL).

## 7. 파일 인덱스

- `dashboard.html` — 현재 대시보드(로컬 파일 버전).
- `dashboard-data.json` — 데이터.
- `sheets-migration/*.csv` — Google Sheets 이관용 5개 탭.
- `docs/superpowers/specs/2026-06-22-project-dashboard-design.md` — 초기 설계.
- `docs/superpowers/specs/2026-06-22-dashboard-visualization.spec.md` — 시각화 계획.
- `docs/superpowers/specs/2026-06-22-sheets-backend-and-permissions.spec.md` — 백엔드·권한.
- `docs/superpowers/specs/2026-06-22-dashboard-overview.spec.md` — (이 문서) 종합 정리.
