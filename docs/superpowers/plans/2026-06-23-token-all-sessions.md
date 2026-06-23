# Token All-Sessions Auto-Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `~/.claude/projects/` 하위 모든 JSONL(Claude Code + Cowork 서브에이전트)을 스캔해 토큰을 자동 집계하고 대시보드에 표시. cost 제거, 수동 입력 UI 불필요.

**Architecture:** `statusline.mjs`가 매 틱마다 `~/.claude/projects/**/*.jsonl`을 전부 읽어 session_id(파일명)별로 토큰을 캐싱한다. 현재 활성 세션만 매번 재계산하고, 나머지는 로그 캐시를 재사용한다. 결과를 `dashboard-tokens.js`(sidecar)로 내보내며, `dashboard-core.js`는 cost 관련 코드를 제거하고 sidecar를 그대로 렌더링한다.

**Tech Stack:** Node.js ESM (statusline.mjs), Vanilla JS (dashboard-core.js)

## Global Constraints

- Node.js ESM (`import`/`export`), `node:fs`, `node:path`, `node:os` 만 사용 (외부 패키지 없음)
- `dashboard-core.js`는 브라우저 전용 Vanilla JS, `global` 변수로 `window` 참조
- `dashboard-tokens.js` 형식: `window.DASHBOARD_TOKENS = { generatedAt, daily, sessions };`
- `daily` 항목: `{ date, tokens }` (cost 없음)
- `sessions` 항목: `{ sessionId, date, time, tokens }` (cost 없음), 최근 100개

---

## File Map

| 파일 | 역할 | 변경 |
|------|------|------|
| `tools/statusline.mjs` | JSONL 전체 스캔 → log 캐시 → sidecar 생성 → 상태줄 출력 | 전면 교체 |
| `.dashboard-token-log.json` | session_id별 캐시 (tokens, date, time, updatedAt) | 초기화 |
| `dashboard-tokens.js` | window.DASHBOARD_TOKENS sidecar | statusline이 재생성 |
| `dashboard-core.js` | cost 렌더링 제거 | 부분 수정 |

---

## Task 1: statusline.mjs 전면 교체

**Files:**
- Modify: `tools/statusline.mjs`
- Modify: `.dashboard-token-log.json` (초기화)

**Interfaces:**
- Produces: `window.DASHBOARD_TOKENS = { generatedAt: string, daily: [{date,tokens}], sessions: [{sessionId,date,time,tokens}] }`
- Produces: stdout `[model] 🪙 12.3k tok`

- [ ] **Step 1: 로그 파일 초기화**

```bash
echo '{"sessions":{}}' > /Users/ohhanseung/HS_Dashboard/.dashboard-token-log.json
```

- [ ] **Step 2: statusline.mjs 전체 교체**

`tools/statusline.mjs` 전체를 아래 코드로 교체:

```js
#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = process.env.CLAUDE_DASHBOARD_DIR || path.resolve(__dirname, "..");
const LOG_PATH = path.join(DASHBOARD_DIR, ".dashboard-token-log.json");
const SIDECAR_PATH = path.join(DASHBOARD_DIR, "dashboard-tokens.js");
const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

function localDate(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function localTime(d) {
  return String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0");
}

// JSONL 한 파일에서 토큰 합산
function sumTokens(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, "utf8"); } catch { return { tokens: 0, firstTs: null }; }
  let total = 0, firstTs = null;
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    let obj;
    try { obj = JSON.parse(s); } catch { continue; }
    // 첫 번째 타임스탬프 수집
    if (!firstTs) {
      const ts = obj.timestamp || (obj.message && obj.message.created_at);
      if (ts) firstTs = ts;
    }
    const usage = (obj.message && obj.message.usage) || obj.usage;
    if (usage && typeof usage === "object") {
      total += (usage.input_tokens || 0)
        + (usage.output_tokens || 0)
        + (usage.cache_creation_input_tokens || 0)
        + (usage.cache_read_input_tokens || 0);
    }
  }
  return { tokens: total, firstTs };
}

// ~/.claude/projects/ 하위 모든 JSONL 열거
function allJsonlFiles() {
  const files = [];
  if (!fs.existsSync(PROJECTS_DIR)) return files;
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    const projDir = path.join(PROJECTS_DIR, proj);
    let entries;
    try { entries = fs.readdirSync(projDir); } catch { continue; }
    for (const f of entries) {
      if (f.endsWith(".jsonl")) {
        files.push({ sessionId: f.replace(".jsonl", ""), filePath: path.join(projDir, f) });
      }
    }
  }
  return files;
}

function loadLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, "utf8")); }
  catch { return { sessions: {} }; }
}

function saveLog(log) {
  try { fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2)); } catch {}
}

function buildDaily(log) {
  const byDate = {};
  for (const s of Object.values(log.sessions)) {
    if (!s || !s.date) continue;
    byDate[s.date] = (byDate[s.date] || 0) + (s.tokens || 0);
  }
  return Object.entries(byDate)
    .map(([date, tokens]) => ({ date, tokens }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function buildSessions(log) {
  return Object.entries(log.sessions)
    .map(([sid, s]) => ({
      sessionId: sid,
      date: s.date || "",
      time: s.time || "",
      tokens: s.tokens || 0,
      updatedAt: s.updatedAt || ""
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 100);
}

function writeSidecar(daily, sessions) {
  const payload = { generatedAt: new Date().toISOString(), daily, sessions };
  const js = "window.DASHBOARD_TOKENS = " + JSON.stringify(payload, null, 2) + ";\n";
  try { fs.writeFileSync(SIDECAR_PATH, js); } catch {}
}

function main() {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch {}

  const now = new Date();
  const activeSessionId = data.session_id || null;
  const model = (data.model && data.model.display_name) || "";

  const log = loadLog();
  const allFiles = allJsonlFiles();

  for (const { sessionId, filePath } of allFiles) {
    const isActive = sessionId === activeSessionId;
    const cached = log.sessions[sessionId];
    // 완료된 세션은 캐시 재사용 (단, 토큰이 0이면 재계산)
    if (cached && cached.tokens > 0 && !isActive) continue;

    const stat = fs.statSync(filePath);
    const { tokens, firstTs } = sumTokens(filePath);
    const sessionDate = firstTs
      ? localDate(new Date(firstTs))
      : localDate(new Date(stat.birthtimeMs || stat.mtimeMs));
    const sessionTime = firstTs
      ? localTime(new Date(firstTs))
      : localTime(new Date(stat.birthtimeMs || stat.mtimeMs));

    log.sessions[sessionId] = {
      date: (cached && cached.date) || sessionDate,
      time: (cached && cached.time) || sessionTime,
      tokens,
      updatedAt: now.toISOString()
    };
  }

  saveLog(log);
  const daily = buildDaily(log);
  const sessions = buildSessions(log);
  writeSidecar(daily, sessions);

  // 현재 세션 토큰 상태줄 출력
  const currentSession = activeSessionId && log.sessions[activeSessionId];
  const tk = currentSession
    ? (currentSession.tokens >= 1000
        ? (currentSession.tokens / 1000).toFixed(1) + "k"
        : String(currentSession.tokens))
    : "0";
  process.stdout.write(`[${model}] 🪙 ${tk} tok`);
}

main();
```

- [ ] **Step 3: 실행 권한 확인 및 수동 테스트**

```bash
echo '{"session_id":"daa45ab2-f63d-44d7-ad4c-f16f8eed5827","model":{"display_name":"claude-sonnet-4-6"}}' \
  | node /Users/ohhanseung/HS_Dashboard/tools/statusline.mjs
```

예상 출력: `[claude-sonnet-4-6] 🪙 <숫자>k tok`  
(0이 아닌 숫자여야 함)

- [ ] **Step 4: 로그 파일과 sidecar 내용 확인**

```bash
cat /Users/ohhanseung/HS_Dashboard/.dashboard-token-log.json | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(len(d['sessions']), 'sessions'); \
   total=sum(v['tokens'] for v in d['sessions'].values()); print('total tokens:', total)"

head -5 /Users/ohhanseung/HS_Dashboard/dashboard-tokens.js
```

예상: sessions 수 ≥ 1, total tokens > 0

- [ ] **Step 5: 커밋**

```bash
git -C /Users/ohhanseung/HS_Dashboard add tools/statusline.mjs .dashboard-token-log.json
git -C /Users/ohhanseung/HS_Dashboard commit -m "feat: statusline 전체 JSONL 스캔으로 교체, cost 제거"
```

---

## Task 2: dashboard-core.js cost 제거

**Files:**
- Modify: `dashboard-core.js`

**Interfaces:**
- Consumes: `window.DASHBOARD_TOKENS.daily[].{ date, tokens }` (cost 없음)
- Consumes: `window.DASHBOARD_TOKENS.sessions[].{ sessionId, date, time, tokens }` (cost 없음)

- [ ] **Step 1: `buildDaily` 함수에서 cost 제거**

`dashboard-core.js`의 `buildDaily` 함수 (line 74-83):

```js
function buildDaily(log) {
  const byDate = {};
  for (const s of Object.values(log.sessions)) {
    if (!s || !s.date) continue;
    if (!byDate[s.date]) byDate[s.date] = { date: s.date, tokens: 0, cost: 0 };
    byDate[s.date].tokens += s.tokens || 0;
    byDate[s.date].cost += s.cost || 0;
  }
  return Object.values(byDate).sort((a, b) => (a.date < b.date ? -1 : 1));
}
```

이 함수는 `statusline.mjs`에만 있고 `dashboard-core.js`에는 없음 — 이 스텝은 건너뜀.

실제로 수정할 항목 확인:

```bash
grep -n "cost" /Users/ohhanseung/HS_Dashboard/dashboard-core.js
```

- [ ] **Step 2: `sessionsHtml`에서 cost 컬럼 제거 확인**

`dashboard-core.js` line 724-741의 `sessionsHtml` 함수 확인. 이미 cost 없음 → 변경 불필요.

- [ ] **Step 3: `buildSessions`에서 cost 필드 제거**

`dashboard-core.js` line 85-97의 `buildSessions`:

```js
function buildSessions(log) {
  return Object.entries(log.sessions)
    .map(([sid, s]) => ({
      sessionId: sid,
      date: s.date || "",
      time: s.time || "",
      tokens: s.tokens || 0,
      cost: s.cost || 0,        // ← 이 줄 제거
      updatedAt: s.updatedAt || ""
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 50);
}
```

`dashboard-core.js`에 `buildSessions`가 없는지 확인 후, 있으면 `cost: s.cost || 0,` 줄 삭제.

- [ ] **Step 4: grep으로 cost 참조 잔여물 확인 및 제거**

```bash
grep -n "\.cost\b\|cost\." /Users/ohhanseung/HS_Dashboard/dashboard-core.js
```

나타나는 각 줄: 렌더링에 `s.cost` / `d.cost`를 직접 쓰는 부분이 있으면 제거 또는 주석 처리.
`token-refresh` CSS 클래스나 `.cost` DOM 클래스 등 관련 없는 이름은 그대로 둠.

- [ ] **Step 5: 대시보드 열어서 토큰 탭 확인**

브라우저에서 `dashboard.html`을 열고 "토큰" 탭 클릭.
- "새로고침" 버튼 작동
- 날짜별 토큰 숫자 표시
- cost 관련 텍스트/컬럼 없음

- [ ] **Step 6: 커밋**

```bash
git -C /Users/ohhanseung/HS_Dashboard add dashboard-core.js
git -C /Users/ohhanseung/HS_Dashboard commit -m "feat: dashboard cost 컬럼 제거, 토큰만 표시"
```

---

## Task 3: 통합 검증

- [ ] **Step 1: statusline 재실행 후 sidecar 확인**

```bash
echo '{"session_id":"daa45ab2-f63d-44d7-ad4c-f16f8eed5827","model":{"display_name":"claude-sonnet-4-6"}}' \
  | node /Users/ohhanseung/HS_Dashboard/tools/statusline.mjs
cat /Users/ohhanseung/HS_Dashboard/dashboard-tokens.js | head -20
```

예상: `daily` 배열에 날짜별 토큰 합산, `sessions` 배열에 UUID별 기록, cost 필드 없음.

- [ ] **Step 2: 모든 JSONL 토큰 합계와 sidecar 합계 일치 확인**

```bash
python3 - <<'EOF'
import os, json, glob
base = os.path.expanduser("~/.claude/projects")
total = 0
for f in glob.glob(f"{base}/**/*.jsonl", recursive=True):
    for line in open(f):
        line = line.strip()
        if not line: continue
        try:
            obj = json.loads(line)
            u = (obj.get("message") or {}).get("usage") or obj.get("usage") or {}
            total += u.get("input_tokens",0)+u.get("output_tokens",0)+u.get("cache_creation_input_tokens",0)+u.get("cache_read_input_tokens",0)
        except: pass
print(f"JSONL 실제 합계: {total:,}")
EOF

python3 -c "
import json
with open('/Users/ohhanseung/HS_Dashboard/dashboard-tokens.js') as f:
    content = f.read().replace('window.DASHBOARD_TOKENS = ', '').rstrip(';\n')
d = json.loads(content)
total = sum(day['tokens'] for day in d['daily'])
print(f'sidecar daily 합계: {total:,}')
"
```

두 숫자가 일치해야 함.

- [ ] **Step 3: 최종 커밋 (필요 시)**

변경 사항이 있으면:
```bash
git -C /Users/ohhanseung/HS_Dashboard add -A
git -C /Users/ohhanseung/HS_Dashboard commit -m "chore: token 통합 검증 완료"
```
