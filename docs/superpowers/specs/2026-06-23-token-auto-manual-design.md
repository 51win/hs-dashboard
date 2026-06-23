# Token Auto-Recording (All Sessions)

**Date:** 2026-06-23 (revised)

## Goal

Claude Code 및 Cowork 서브에이전트 세션 토큰을 모두 자동 집계해 대시보드에 표시.
비용(cost) 표시는 제거. 수동 입력 UI 불필요.

## Key Insight

Cowork 서브에이전트도 `~/.claude/projects/<project>/*.jsonl`에 transcript를 남김.
→ 모든 JSONL을 스캔하면 수동 입력 없이 전체 토큰 집계 가능.

## Architecture

```
~/.claude/projects/**/*.jsonl   (Claude Code + Cowork 전체)
         ↓  statusline.mjs (매 틱)
.dashboard-token-log.json       (session_id → {date, tokens} 캐시)
         ↓
dashboard-tokens.js             (window.DASHBOARD_TOKENS)
         ↓
dashboard.html 토큰 탭          (날짜별 차트 + 세션 목록)
```

---

## Part 1: statusline.mjs 수정

### 변경 내용

**1. 전체 JSONL 스캔**

stdin의 `transcript_path` 단일 파일 대신, `~/.claude/projects/` 하위 **모든 `.jsonl`** 을 순회.

```
~/.claude/projects/<any-dir>/*.jsonl
```

**2. session_id = 파일명 (UUID)**

각 JSONL 파일명이 session_id. 이미 처리한 세션은 로그에 캐싱해 재계산 생략.
단, 현재 활성 세션(`data.session_id`)은 매 틱마다 재계산 (진행 중이므로).

**3. 날짜 결정**

JSONL 내 첫 번째 타임스탬프 필드 사용. 없으면 파일 생성일(birthtime) 사용.

**4. cost 제거**

`cost` 필드 및 `$` 관련 출력 전부 제거.
상태줄 출력: `[model] 🪙 12.3k tok`

**5. 디버그 로그 제거**

더미 데이터 및 디버그 파일 미생성.

### 출력 형식 변경

```
window.DASHBOARD_TOKENS = {
  generatedAt: "...",
  daily:    [{ date, tokens }],          // cost 제거
  sessions: [{ sessionId, date, time, tokens }]  // cost 제거, 최근 100개
}
```

---

## Part 2: dashboard-core.js 수정

### 변경 내용

- `cost` 관련 렌더링 코드 전부 제거
- 토큰 탭: 수동 추가 폼 없음 (localStorage 연동 불필요)
- 일별 차트/테이블: `tokens` 만 표시
- 세션 목록: `sessionId`, `date`, `time`, `tokens` 표시
- "새로고침" 버튼 유지 (dashboard-tokens.js 재로드)

---

## Files Changed

| 파일 | 변경 |
|------|------|
| `tools/statusline.mjs` | 전체 JSONL 스캔, cost 제거, 날짜 자동 탐지 |
| `dashboard-core.js` | cost 렌더링 제거, 수동 추가 UI 제거 |
| `.dashboard-token-log.json` | 기존 더미 데이터 초기화 |

---

## Out of Scope

- 토큰 단가/비용 표시
- 수동 입력 UI
- 외부 API 연동
