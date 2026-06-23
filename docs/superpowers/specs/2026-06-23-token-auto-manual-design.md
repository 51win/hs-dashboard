# Token Auto-Recording & Manual Cowork Upload

**Date:** 2026-06-23

## Goals

1. Claude Code 세션 토큰이 statusline 훅을 통해 대시보드에 자동 반영
2. Cowork 사용분을 대시보드 UI에서 수동으로 추가 (날짜 + 토큰 + 비용 + 메모)

## Architecture

### 데이터 소스 두 개, 렌더링 시 합산

```
[자동] statusline.mjs → .dashboard-token-log.json → dashboard-tokens.js
                                                              ↓ window.DASHBOARD_TOKENS
                                                         renderTokensTab()
                                                              ↑ 합산
[수동] 대시보드 UI 폼 → localStorage["dashboard-manual-tokens"]
```

---

## Part 1: statusline.mjs 수정

### 현재 버그
- `.dashboard-token-log.json`에 `tokens: 0` 기록됨
- 원인: stdin 페이로드에 `transcript_path`가 없거나 경로 불일치

### 수정 내용

**1. transcript 자동 탐색 fallback**

`transcript_path`가 비어있으면 다음 경로에서 최신 JSONL 파일 자동 탐색:
```
~/.claude/projects/<encoded-cwd>/*.jsonl
```
`encoded-cwd` = 프로젝트 경로에서 `/` → `-` 변환 (Claude Code 규칙).

**2. 디버그 로그**

첫 실행 시 `dashboard-token-debug.log`에 수신 페이로드 기록.
정상 확인 후 삭제 예정.

**3. cost 보완**

`cost.total_cost_usd`가 0이면 transcript usage에서 Sonnet 4.6 단가로 추정:
- input: $3/M, output: $15/M (캐시 토큰 제외)

---

## Part 2: 대시보드 수동 추가 UI

### 저장 구조 (localStorage)

Key: `dashboard-manual-tokens`
Value: JSON 배열
```json
[
  {
    "id": "manual-1719100000000",
    "date": "2026-06-23",
    "tokens": 50000,
    "cost": 1.50,
    "memo": "cowork 오전 세션",
    "source": "cowork",
    "createdAt": "2026-06-23T09:00:00.000Z"
  }
]
```

### 토큰 탭 UI 변경

**버튼 영역**
```
[새로고침]  [+ 수동 추가]
```

**수동 추가 폼** (+ 버튼 클릭 시 인라인 펼침)
```
날짜: [____-__-__]  토큰: [______]  비용($): [____]
메모: [_________________________]
                          [저장]  [취소]
```
- 날짜 기본값: 오늘
- 토큰/비용: 숫자 입력, 빈 값 허용 (0 처리)
- 저장 시 localStorage에 append

**세션 목록 변경**
- 수동 입력 행: `[cowork]` 배지 + `×` 삭제 버튼
- 자동 기록 행: 기존 그대로

**일별 합산**
- `buildMergedDaily()`: `DASHBOARD_TOKENS.daily` + localStorage 수동 데이터를 날짜 키로 합산
- 차트/테이블 모두 이 합산 데이터 사용

### 렌더링 함수 변경점

`tokensHtml(data)` 및 관련 render 함수:
1. `loadManualTokens()` — localStorage에서 수동 배열 로드
2. `buildMergedDaily(auto, manual)` — 날짜별 합산
3. `buildMergedSessions(auto, manual)` — 세션 목록 합산 (수동은 source 필드로 구분)
4. `deleteManualToken(id)` — 삭제 후 rerender

---

## Files Changed

| 파일 | 변경 |
|------|------|
| `tools/statusline.mjs` | transcript 자동 탐색, 디버그 로그 |
| `dashboard-core.js` | 수동 추가 UI, localStorage 통합, 합산 렌더링 |

`dashboard.html`은 변경 없음 (이미 `dashboard-tokens.js` 로드 중).

---

## Out of Scope

- 수동 입력 데이터의 서버 동기화
- Cowork API 자동 연동
- 토큰 단가 설정 UI
