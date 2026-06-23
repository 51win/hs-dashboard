# Token → Google Sheets DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 토큰 사용 데이터를 Google Sheets "Sessions" 탭에 적재하고 index.html/edit.html 모두 Sheets에서 읽도록 교체한다.

**Architecture:** `statusline.mjs`가 매 틱마다 현재 세션 토큰을 Apps Script endpoint로 upsert한다. `dashboard-core.js`는 토큰 탭 진입 시 동일 endpoint에서 세션 목록을 JSONP로 읽어 클라이언트에서 날짜별 집계한다. 로컬 파일(`dashboard-tokens.js`, `.dashboard-token-log.json`)은 폐기된다.

**Tech Stack:** Node.js ESM (`node:https`), Vanilla JS (dashboard-core.js), Google Apps Script, JSONP

## Global Constraints

- Apps Script endpoint: `https://script.google.com/macros/s/AKfycbzV48f1Y-rG2nOFgW1LY2C7JJSv0ixU0xUsAhpoDdHtRJ07WCKL0uzOsRlfT8UwUBVefg/exec`
- Sheets 탭 이름: `Sessions`, 헤더: `sessionId | date | time | tokens` (4열)
- `dashboard-core.js`는 브라우저 Vanilla JS — `import` 없음, `global`로 `window` 참조
- JSONP callback 파라미터명: `callback`
- statusline stdout: `[model] 🪙 Nk tok` (변경 없음)
- Sheets upsert는 fire-and-forget (응답 대기 안 함)
- `index.html`에 `DASHBOARD_READ_ENDPOINT` 전역 추가, `edit.html`은 기존 `DASHBOARD_WRITE_ENDPOINT` 재사용
- 기존 Tasks/Checklist 동작 변경 없음

---

## File Map

| 파일 | 변경 |
|------|------|
| `tools/statusline.mjs` | Sheets upsert 추가, 로컬 파일 쓰기 제거 |
| `dashboard-core.js` | Sheets JSONP 읽기로 교체, `DASHBOARD_TOKENS` 제거 |
| `index.html` | `DASHBOARD_READ_ENDPOINT` 추가, `dashboard-tokens.js` 태그 제거 |
| `edit.html` | `dashboard-tokens.js` 태그 제거 |
| `dashboard-tokens.js` | 빈 파일로 교체 (삭제 시 브라우저 에러 방지) |

---

## Task 1: statusline.mjs — Sheets upsert 추가, 로컬 파일 쓰기 제거

**Files:**
- Modify: `tools/statusline.mjs`

**Interfaces:**
- Produces: GET `{ENDPOINT}?action=upsertTokenSession&payload=<JSON>&callback=_dummy` 호출
- `payload` JSON: `{ sessionId: string, date: string, time: string, tokens: number }`

- [ ] **Step 1: `WRITE_ENDPOINT` 상수 추가 및 `upsertToSheets` 함수 작성**

`tools/statusline.mjs` 상단 상수 블록에 추가:

```js
const WRITE_ENDPOINT = process.env.DASHBOARD_WRITE_ENDPOINT ||
  "https://script.google.com/macros/s/AKfycbzV48f1Y-rG2nOFgW1LY2C7JJSv0ixU0xUsAhpoDdHtRJ07WCKL0uzOsRlfT8UwUBVefg/exec";
```

파일 내 다른 함수들 아래에 추가:

```js
import https from "node:https";

function upsertToSheets(sessionId, date, time, tokens) {
  if (!WRITE_ENDPOINT) return;
  const payload = JSON.stringify({ sessionId, date, time, tokens });
  const url = WRITE_ENDPOINT +
    "?action=upsertTokenSession" +
    "&payload=" + encodeURIComponent(payload) +
    "&callback=_dummy";
  https.get(url, () => {}).on("error", () => {});
}
```

- [ ] **Step 2: `main()` 에서 활성 세션만 upsert, 로컬 파일 쓰기 제거**

`main()` 함수 끝부분을 다음으로 교체:

```js
  // 활성 세션 upsert to Sheets (fire-and-forget)
  if (activeSessionId && log.sessions[activeSessionId]) {
    const s = log.sessions[activeSessionId];
    upsertToSheets(activeSessionId, s.date, s.time, s.tokens);
  }

  // stdout 출력
  const currentSession = activeSessionId && log.sessions[activeSessionId];
  const tk = currentSession
    ? (currentSession.tokens >= 1000
        ? (currentSession.tokens / 1000).toFixed(1) + "k"
        : String(currentSession.tokens))
    : "0";
  process.stdout.write(`[${model}] 🪙 ${tk} tok`);
```

`saveLog(log);` / `writeSidecar(...)` 호출은 **그대로 유지** — 로컬 캐시는 세션 중복 재계산 방지용으로 계속 필요.

- [ ] **Step 3: `import https` 줄이 파일 상단 import 블록에 있는지 확인**

`tools/statusline.mjs` 첫 줄들:

```js
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import { fileURLToPath } from "node:url";
```

- [ ] **Step 4: 수동 확인 (node 없는 환경 대비 코드 검토)**

```bash
grep -n "upsertToSheets\|WRITE_ENDPOINT\|https" /Users/ohhanseung/HS_Dashboard/tools/statusline.mjs
```

예상: `upsertToSheets` 정의 1개, `main()` 안에서 호출 1개, `import https` 1개.

- [ ] **Step 5: 커밋**

```bash
git -C /Users/ohhanseung/HS_Dashboard add tools/statusline.mjs
git -C /Users/ohhanseung/HS_Dashboard commit -m "feat: statusline Sheets upsert 추가 (fire-and-forget)"
```

---

## Task 2: dashboard-core.js — Sheets JSONP 읽기로 교체

**Files:**
- Modify: `dashboard-core.js`

**Interfaces:**
- Consumes: `global.DASHBOARD_WRITE_ENDPOINT` (edit.html) 또는 `global.DASHBOARD_READ_ENDPOINT` (index.html)
- GET `{endpoint}?action=readTokenSessions&callback=<cb>` → `{ ok: true, sessions: [{sessionId, date, time, tokens}] }`

- [ ] **Step 1: `READ_ENDPOINT` 변수 추가**

`dashboard-core.js` 상단 변수 블록 (`var WRITE_ENDPOINT = ...` 근처, line ~28):

```js
var READ_ENDPOINT = (typeof global !== "undefined" && global.DASHBOARD_READ_ENDPOINT)
  ? String(global.DASHBOARD_READ_ENDPOINT)
  : WRITE_ENDPOINT;
```

- [ ] **Step 2: `loadTokenSessionsFromSheet` 함수 추가**

`dailyTokenSeries()` 함수(line ~123) 바로 위에 추가:

```js
  // _tokenSessions: Sheets에서 로드된 세션 배열 캐시
  var _tokenSessions = null;
  var _tokenSessionsLoading = false;

  function loadTokenSessionsFromSheet(onDone) {
    if (!READ_ENDPOINT) { onDone([]); return; }
    if (typeof document === "undefined" || !document.createElement || !document.head) { onDone([]); return; }
    _tokenSessionsLoading = true;
    var cb = "_tokCb" + Date.now();
    var s = document.createElement("script");
    s.src = READ_ENDPOINT + "?action=readTokenSessions&callback=" + encodeURIComponent(cb);
    global[cb] = function (res) {
      delete global[cb];
      document.head.removeChild(s);
      _tokenSessionsLoading = false;
      _tokenSessions = (res && res.ok && Array.isArray(res.sessions)) ? res.sessions : [];
      onDone(_tokenSessions);
    };
    s.onerror = function () {
      delete global[cb];
      try { document.head.removeChild(s); } catch (_) {}
      _tokenSessionsLoading = false;
      _tokenSessions = [];
      onDone([]);
    };
    document.head.appendChild(s);
  }
```

- [ ] **Step 3: `dailyTokenSeries()` 를 Sheets 데이터 기반으로 교체**

기존 `dailyTokenSeries()` (line ~123-129):

```js
  function dailyTokenSeries() {
    var dt = global.DASHBOARD_TOKENS;
    if (!dt || !Array.isArray(dt.daily)) return [];
    return dt.daily
      .filter(function (d) { return d.date >= START_DATE; })
      .slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
```

교체:

```js
  function dailyTokenSeries() {
    var sessions = _tokenSessions || [];
    var byDate = {};
    sessions.forEach(function (s) {
      if (!s.date || s.date < START_DATE) return;
      byDate[s.date] = (byDate[s.date] || 0) + (Number(s.tokens) || 0);
    });
    return Object.keys(byDate).sort().map(function (date) {
      return { date: date, tokens: byDate[date] };
    });
  }
```

- [ ] **Step 4: `hourlyBuckets()` 를 Sheets 데이터 기반으로 교체**

기존 `hourlyBuckets()` (line ~172-184):

```js
  function hourlyBuckets() {
    var dt = global.DASHBOARD_TOKENS;
    var buckets = {};
    if (dt && Array.isArray(dt.sessions)) {
      dt.sessions.forEach(function (s) {
        if (!s.time || s.date < START_DATE) return;
        var h = parseInt(s.time.split(":")[0], 10);
        if (isNaN(h) || h < 0 || h > 23) return;
        buckets[h] = (buckets[h] || 0) + (s.tokens || 0);
      });
    }
    return buckets;
  }
```

교체:

```js
  function hourlyBuckets() {
    var sessions = _tokenSessions || [];
    var buckets = {};
    sessions.forEach(function (s) {
      if (!s.time || s.date < START_DATE) return;
      var h = parseInt(s.time.split(":")[0], 10);
      if (isNaN(h) || h < 0 || h > 23) return;
      buckets[h] = (buckets[h] || 0) + (Number(s.tokens) || 0);
    });
    return buckets;
  }
```

- [ ] **Step 5: `sessionsHtml()` 를 Sheets 데이터 기반으로 교체**

기존 `sessionsHtml()` (line ~725-741):

```js
  function sessionsHtml() {
    var dt = global.DASHBOARD_TOKENS;
    if (!dt || !Array.isArray(dt.sessions) || !dt.sessions.length) {
      return '<div class="empty">세션 기록이 없습니다.</div>';
    }
    var valid = dt.sessions.filter(function (s) { return s.date >= START_DATE; });
    if (!valid.length) return '<div class="empty">세션 기록이 없습니다.</div>';
    var rows = valid.slice(0, 100).map(function (s) {
      var tk = fmtTok(s.tokens || 0);
      var when = s.time ? esc(s.date) + " " + esc(s.time) : esc(s.date);
      return '<div class="tok-day-row">' +
        '<span class="tok-day-date">' + when + "</span>" +
        '<span class="tok-day-count">' + tk + "</span>" +
        "</div>";
    }).join("");
    return '<div class="tok-daily-list">' + rows + "</div>";
  }
```

교체:

```js
  function sessionsHtml() {
    if (_tokenSessionsLoading) return '<div class="empty">불러오는 중...</div>';
    var sessions = _tokenSessions;
    if (!sessions) return '<div class="empty">불러오는 중...</div>';
    var valid = sessions.filter(function (s) { return s.date >= START_DATE; });
    if (!valid.length) return '<div class="empty">세션 기록이 없습니다.</div>';
    var rows = valid.slice(0, 100).map(function (s) {
      var tk = fmtTok(Number(s.tokens) || 0);
      var when = s.time ? esc(s.date) + " " + esc(s.time) : esc(s.date);
      return '<div class="tok-day-row">' +
        '<span class="tok-day-date">' + when + "</span>" +
        '<span class="tok-day-count">' + tk + "</span>" +
        "</div>";
    }).join("");
    return '<div class="tok-daily-list">' + rows + "</div>";
  }
```

- [ ] **Step 6: `tokensHtml()` 에 로딩 처리 추가**

기존 `tokensHtml(data)` (line ~753):

```js
  function tokensHtml(data) {
    var series = mergedDailySeries();
    return '<button class="token-refresh" type="button">새로고침</button>' +
      ...
  }
```

교체:

```js
  function tokensHtml(data) {
    if (_tokenSessions === null && !_tokenSessionsLoading) {
      // 최초 진입: Sheets에서 로드 후 재렌더
      loadTokenSessionsFromSheet(function () { if (_tab === "tokens") rerender(); });
      return '<div class="empty">불러오는 중...</div>';
    }
    var series = mergedDailySeries();
    return '<button class="token-refresh" type="button">새로고침</button>' +
      weeklyHtml(series) +
      "<h2>시간대별 사용</h2>" + hourlyChartSvg() +
      "<h2>일별 추이</h2>" + trendChartSvg(series) +
      "<h2>일별 기록</h2>" + dailyListHtml(series) +
      "<h2>세션별 기록</h2>" + sessionsHtml() +
      "<h2>과제별 비교</h2>" + compareChartSvg(data);
  }
```

- [ ] **Step 7: `refreshTokensTab()` 교체**

기존:

```js
  function refreshTokensTab() {
    reloadTokensSidecar(function () {
      if (_tab === "tokens") rerender();
    });
  }
```

교체:

```js
  function refreshTokensTab() {
    _tokenSessions = null;
    if (_tab === "tokens") rerender();
  }
```

`reloadTokensSidecar()` 함수 전체 삭제 (line ~764-774).

- [ ] **Step 8: `setupTokenPolling()` 교체**

기존 `reloadTokensSidecar` 호출 부분 (line ~786):

```js
reloadTokensSidecar(function () { if (_tab === "tokens") rerender(); });
```

교체:

```js
_tokenSessions = null;
if (_tab === "tokens") rerender();
```

- [ ] **Step 9: 잔여 `global.DASHBOARD_TOKENS` 참조 확인 및 제거**

```bash
grep -n "DASHBOARD_TOKENS\|reloadTokensSidecar\|dashboard-tokens" /Users/ohhanseung/HS_Dashboard/dashboard-core.js
```

남은 참조가 있으면 제거.

- [ ] **Step 10: 커밋**

```bash
git -C /Users/ohhanseung/HS_Dashboard add dashboard-core.js
git -C /Users/ohhanseung/HS_Dashboard commit -m "feat: dashboard 토큰 탭 Sheets JSONP 읽기로 교체"
```

---

## Task 3: HTML 파일 정리 — endpoint 설정 및 dashboard-tokens.js 태그 제거

**Files:**
- Modify: `index.html`
- Modify: `edit.html`
- Modify: `dashboard-tokens.js` (빈 파일로 교체)

**Interfaces:**
- `index.html`에 `window.DASHBOARD_READ_ENDPOINT` 전역 설정
- `edit.html`의 `DASHBOARD_WRITE_ENDPOINT`는 기존 URL 유지 (새 endpoint로 교체)

- [ ] **Step 1: `index.html` — `DASHBOARD_READ_ENDPOINT` 추가, `dashboard-tokens.js` 제거**

`index.html` line ~733-737 부분:

```html
<script>
  // WRITE_ENDPOINT 없음 → loadFromSheet가 gviz CSV(fetch)로 직접 읽기
</script>
<script src="dashboard-tokens.js"></script>
<script src="dashboard-core.js"></script>
```

교체:

```html
<script>
  window.DASHBOARD_READ_ENDPOINT = "https://script.google.com/macros/s/AKfycbzV48f1Y-rG2nOFgW1LY2C7JJSv0ixU0xUsAhpoDdHtRJ07WCKL0uzOsRlfT8UwUBVefg/exec";
</script>
<script src="dashboard-core.js"></script>
```

- [ ] **Step 2: `edit.html` — `DASHBOARD_WRITE_ENDPOINT` 새 URL로 교체, `dashboard-tokens.js` 제거**

`edit.html` line ~707-713 부분:

```html
<script>
  window.DASHBOARD_WRITE_ENDPOINT = "https://script.google.com/macros/s/AKfycbx0gauf4nOLK3M_xB_k-Rror6XIqaDGObyfLjs_l_ADkPmZLvRbFpSkTJXOh23xKkrB9Q/exec";
</script>
<script src="dashboard-tokens.js"></script>
<script src="dashboard-core.js"></script>
```

교체:

```html
<script>
  window.DASHBOARD_WRITE_ENDPOINT = "https://script.google.com/macros/s/AKfycbzV48f1Y-rG2nOFgW1LY2C7JJSv0ixU0xUsAhpoDdHtRJ07WCKL0uzOsRlfT8UwUBVefg/exec";
</script>
<script src="dashboard-core.js"></script>
```

- [ ] **Step 3: `dashboard-tokens.js` 빈 파일로 교체 (혹시 캐시된 참조 대비)**

```bash
echo "// deprecated" > /Users/ohhanseung/HS_Dashboard/dashboard-tokens.js
```

- [ ] **Step 4: 확인**

```bash
grep -n "dashboard-tokens\|AKfycbx0" /Users/ohhanseung/HS_Dashboard/index.html /Users/ohhanseung/HS_Dashboard/edit.html
```

예상: 결과 없음 (구 endpoint 및 dashboard-tokens 태그 전부 제거됨).

- [ ] **Step 5: 커밋**

```bash
git -C /Users/ohhanseung/HS_Dashboard add index.html edit.html dashboard-tokens.js
git -C /Users/ohhanseung/HS_Dashboard commit -m "feat: HTML endpoint 교체, dashboard-tokens.js 제거"
```

---

## Task 4: 통합 검증

- [ ] **Step 1: `edit.html` 브라우저에서 열기 → 토큰 탭 확인**

`edit.html`을 파일로 직접 열거나 로컬 서버로 열기.

토큰 탭 클릭 → "불러오는 중..." 표시 후 데이터 또는 "세션 기록이 없습니다." 표시.
에러 없어야 함 (브라우저 콘솔 확인).

- [ ] **Step 2: Apps Script endpoint 직접 호출 확인**

브라우저 주소창:
```
https://script.google.com/macros/s/AKfycbzV48f1Y-rG2nOFgW1LY2C7JJSv0ixU0xUsAhpoDdHtRJ07WCKL0uzOsRlfT8UwUBVefg/exec?action=readTokenSessions&callback=test
```

예상 응답: `test({"ok":true,"sessions":[]})` 또는 세션 데이터 포함.

- [ ] **Step 3: statusline 수동 시뮬레이션**

Claude Code 앱에서 현재 세션을 닫거나 대화를 이어가 statusline이 실행되도록 함.
실행 후 위 endpoint 직접 호출로 Sessions 탭에 데이터 추가됐는지 확인.

또는 curl로 직접 테스트:
```bash
curl -L "https://script.google.com/macros/s/AKfycbzV48f1Y-rG2nOFgW1LY2C7JJSv0ixU0xUsAhpoDdHtRJ07WCKL0uzOsRlfT8UwUBVefg/exec?action=upsertTokenSession&payload=$(python3 -c "import urllib.parse,json; print(urllib.parse.quote(json.dumps({'sessionId':'test-123','date':'2026-06-23','time':'10:00','tokens':12345})))")&callback=test"
```

예상: `test({"ok":true,"action":"inserted"})` 또는 `"updated"`.

- [ ] **Step 4: Google Sheets "Sessions" 탭 확인**

Sheets 열어서 Sessions 탭에 행이 추가됐는지 직접 확인.

- [ ] **Step 5: 최종 커밋 (필요 시)**

```bash
git -C /Users/ohhanseung/HS_Dashboard add -A
git -C /Users/ohhanseung/HS_Dashboard commit -m "chore: token Sheets 연동 통합 검증 완료"
```
