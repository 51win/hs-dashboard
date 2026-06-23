# Token Data → Google Sheets DB

**Date:** 2026-06-23

## Goal

토큰 사용 데이터를 Google Sheets에 적재해 `index.html`(공개 열람)과 `edit.html`(내부 수정) 모두에서 동일한 데이터를 표시한다. 로컬 파일(`dashboard-tokens.js`, `.dashboard-token-log.json`) 폐기.

## Architecture

```
statusline.mjs (매 틱, 로컬)
  → JSONL 스캔 → 현재 활성 세션 토큰 집계
  → Apps Script WRITE_ENDPOINT POST
      action=upsertTokenSession
      { sessionId, date, time, tokens }
  → Google Sheets "Sessions" 탭 upsert

index.html / edit.html (읽기)
  → Apps Script GET action=readTokenSessions (JSONP)
  → Sessions 탭 전체 rows 반환
  → 클라이언트에서 날짜별 합산 → 토큰 탭 렌더링
```

**단일 소스:** Google Sheets "Sessions" 탭  
**쓰기:** statusline.mjs (로컬 only, WRITE_ENDPOINT 사용)  
**읽기:** index.html + edit.html 모두 동일 JSONP 호출

---

## Part 1: Apps Script 변경 (`Code.gs`)

### 새로운 Sheets 탭

**"Sessions"** 탭 — 헤더: `sessionId | date | time | tokens`

### 기존 `doGet` 확장

기존 로직(Tasks/Checklist 읽기/쓰기)은 그대로 유지하고, `action` 파라미터로 분기 추가.

```javascript
// doGet 내 분기 추가
const action = e && e.parameter && e.parameter.action;

if (action === 'readTokenSessions') {
  return readTokenSessions(cb);
}

if (action === 'upsertTokenSession') {
  const raw = e && e.parameter && e.parameter.payload;
  if (!raw) return jsonp(cb, { ok: false, error: 'no payload' });
  const body = JSON.parse(raw);
  return upsertTokenSession(cb, body);
}

// 기존: payload 파라미터로 Tasks/Checklist 쓰기
```

### 신규 함수 2개

```javascript
function readTokenSessions(cb) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName('Sessions');
  if (!sh || sh.getLastRow() < 2) return jsonp(cb, { ok: true, sessions: [] });
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  const sessions = rows
    .filter(r => r[0])
    .map(r => ({ sessionId: String(r[0]), date: String(r[1]), time: String(r[2]), tokens: Number(r[3]) || 0 }));
  return jsonp(cb, { ok: true, sessions });
}

function upsertTokenSession(cb, body) {
  const { sessionId, date, time, tokens } = body;
  if (!sessionId) return jsonp(cb, { ok: false, error: 'missing sessionId' });
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName('Sessions') || ss.insertSheet('Sessions');
  // 헤더 보장
  if (sh.getLastRow() === 0) {
    sh.appendRow(['sessionId', 'date', 'time', 'tokens']);
  }
  // sessionId 검색
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(sessionId)) {
      sh.getRange(i + 1, 4).setValue(Number(tokens) || 0);
      return jsonp(cb, { ok: true, action: 'updated' });
    }
  }
  // 없으면 새 행 추가
  sh.appendRow([sessionId, date || '', time || '', Number(tokens) || 0]);
  return jsonp(cb, { ok: true, action: 'inserted' });
}
```

### 배포

코드 수정 후 **새 버전으로 재배포** 필요. URL은 그대로 유지.

---

## Part 2: statusline.mjs 변경

### 환경변수

`DASHBOARD_WRITE_ENDPOINT` — edit.html과 동일한 Apps Script URL.
없으면 Sheets push 생략 (stdout 출력은 정상).

### 변경 로직

1. 현재 활성 세션(`data.session_id`) 토큰 집계 (기존 `sumTokens` 그대로)
2. `WRITE_ENDPOINT`가 있으면 `action=upsertTokenSession&payload=<JSON>` GET 요청 (JSONP 불필요 — statusline은 Node.js, CORS 없음 → `https.get` 직접 사용)
3. **완료 세션 push 안 함** — statusline은 현재 세션만 처리. 과거 세션은 최초 1회 push됐거나 다음 기회에 처리
4. `saveLog()` / `writeSidecar()` 제거
5. 로컬 캐시 완전 제거 — `LOG_PATH`, `SIDECAR_PATH` 상수 제거

### stdout 유지

```
[model] 🪙 Nk tok
```
Sheets 응답을 기다리지 않음 (비동기 fire-and-forget).

---

## Part 3: dashboard-core.js 변경

### 토큰 탭 읽기 교체

`window.DASHBOARD_TOKENS` 전역 및 `reloadTokensSidecar()` 제거.

신규 함수 `loadTokenSessionsFromSheet()`:
- `WRITE_ENDPOINT`가 있으면: `action=readTokenSessions` JSONP 호출
- 없으면: 빈 배열 (index.html — 읽기 전용 접근 불가, 에러 메시지 표시)

**index.html은 `WRITE_ENDPOINT`가 없으므로 별도 read endpoint가 필요.**

→ `DASHBOARD_READ_ENDPOINT` 전역 변수 추가:
- `index.html`: `window.DASHBOARD_READ_ENDPOINT = <WRITE_ENDPOINT와 동일한 URL>`
- `edit.html`: `WRITE_ENDPOINT`와 동일 URL 재사용

`loadTokenSessionsFromSheet()`:
```
READ_ENDPOINT = WRITE_ENDPOINT || READ_ENDPOINT
GET {READ_ENDPOINT}?action=readTokenSessions&callback=<cb>
→ [{ sessionId, date, time, tokens }, ...]
```

### 클라이언트 집계

수신한 세션 배열 → 날짜별 합산 → 기존 `dailyTokenSeries()` / `sessionsHtml()` 등 그대로 사용.

### 로딩 상태

토큰 탭 진입 시:
- 로딩 중: `<div class="empty">불러오는 중...</div>`
- 실패: `<div class="empty">시트 연결 실패</div>`
- 빈 데이터: `<div class="empty">세션 기록 없음</div>`

### 제거

- `<script src="dashboard-tokens.js">` 태그 (index.html, edit.html, dashboard.html)
- `window.DASHBOARD_TOKENS` 참조 전체

---

## Files Changed

| 파일 | 변경 |
|------|------|
| Apps Script `Code.gs` | `readTokenSessions`, `upsertTokenSession` 추가, `doGet` 분기 추가 |
| `tools/statusline.mjs` | Sheets upsert 추가, 로컬 파일 쓰기 제거 |
| `dashboard-core.js` | Sheets 읽기로 교체, `DASHBOARD_TOKENS` 제거 |
| `index.html` | `DASHBOARD_READ_ENDPOINT` 추가, `dashboard-tokens.js` 태그 제거 |
| `edit.html` | `dashboard-tokens.js` 태그 제거 |
| `dashboard.html` | `dashboard-tokens.js` 태그 제거 |
| `dashboard-tokens.js` | 삭제 (또는 빈 파일로 유지) |
| `.dashboard-token-log.json` | 삭제 |

---

## Out of Scope

- 토큰 수동 입력 UI
- 비용(cost) 표시
- Sessions 탭 외 별도 Daily 탭
- Apps Script 인증 변경
