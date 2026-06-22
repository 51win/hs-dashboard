# 프로젝트 대시보드 구조 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 큰 과제 6개(3×2) + 작은 과제 + 개인 과제를 한 화면에 보여주고, 체크리스트 중요도 가중 진행률을 과제 단위로 추적·편집하는 오프라인 단일 파일 대시보드를 만든다.

**Architecture:** 의존성 없는 단일 `dashboard.html`(인라인 `<script>`)이 `window.Dashboard` 네임스페이스에 순수 로직(진행률 계산·집계)과 DOM 렌더·편집을 노출한다. 데이터는 `dashboard-data.json` 시드 + localStorage 저장. 테스트는 jsdom으로 HTML을 로드해 `window.Dashboard.*`를 검증한다(런타임은 무의존, jsdom은 테스트 전용 dev 의존성).

**Tech Stack:** Vanilla HTML/CSS/JS, SVG/CSS만(외부 차트 라이브러리 없음). 테스트: Node `node:test` + `jsdom`.

## Global Constraints

- 외부 런타임 의존성 0개 — `dashboard.html`은 오프라인 단일 파일로 동작(`jsdom`은 테스트 전용).
- 모든 시각화는 SVG/CSS로만 구현.
- 진행률은 **과제 단위로만** 존재. 그룹(목표) 합산 퍼센트는 계산·표시하지 않는다.
- 중요도 가중치: `high=3, mid=2, low=1`.
- `status === 'done'` 과제는 진행률 항상 100.
- 모든 위치에서 상태/담당을 진행률보다 먼저·강하게 노출.
- 상태 값: `'todo' | 'in_progress' | 'done'` (표시: 예정 / 진행 / 완료).
- 중요도 값: `'high' | 'mid' | 'low'` (표시: 상 / 중 / 하), 기본값 `'mid'`.
- 그룹 kind: `'team_goal' | 'small' | 'personal'`.

---

## File Structure

- Create: `dashboard.html` — 단일 파일. `<style>` + 마운트용 `<div id="app">` + 인라인 `<script>`(IIFE)로 `window.Dashboard` 노출.
- Create: `dashboard-data.json` — 시드 데이터(3그룹, 큰 과제 6 + 작은/개인 샘플).
- Create: `tests/helpers.js` — jsdom으로 `dashboard.html`을 로드하고 `window` 반환.
- Create: `tests/progress.test.js` — 진행률 계산 단위 테스트.
- Create: `tests/data.test.js` — 데이터 로드/접근자 테스트.
- Create: `tests/storage.test.js` — 저장/내보내기/가져오기 테스트.
- Create: `tests/render.test.js` — 렌더 DOM 구조 테스트.
- Create: `tests/edit.test.js` — 편집/자동저장 테스트.
- Create: `package.json` — `jsdom` devDependency + `test` 스크립트.

`window.Dashboard`가 노출하는 멤버(태스크 전반에서 사용):

```
Dashboard = {
  WEIGHTS,                       // { high:3, mid:2, low:1 }
  statusToProgress(status),      // 'todo'|'in_progress'|'done' -> 0|50|100
  taskProgress(task),            // -> 정수 0..100
  tasksInGroup(data, groupId),   // -> Task[]
  groupByKind(data, kind),       // -> Group | undefined
  defaultData(),                 // -> 시드 데이터 깊은 복제
  loadData(),                    // localStorage 또는 defaultData()
  saveData(data),                // localStorage 저장
  exportData(data),              // -> JSON 문자열
  importData(jsonString),        // -> 검증된 data 객체 (실패 시 throw)
  render(data, rootEl),          // #app 안에 전체 화면 렌더
  init(rootEl)                   // loadData + render + 이벤트 바인딩
}
```

---

## Task 1: 스캐폴딩 + 데이터 스키마 + 시드 + 테스트 하니스

**Files:**
- Create: `package.json`
- Create: `dashboard-data.json`
- Create: `dashboard.html`
- Create: `tests/helpers.js`
- Test: `tests/data.test.js`

**Interfaces:**
- Consumes: (없음)
- Produces: `window.Dashboard.defaultData()` → `{version:1, groups:Group[], tasks:Task[]}`; `Dashboard.tasksInGroup(data, groupId)` → `Task[]`; `Dashboard.groupByKind(data, kind)` → `Group|undefined`. 타입: `Group = {id:string, name:string, kind:'team_goal'|'small'|'personal', order:number}`; `Task = {id, groupId, name, status:'todo'|'in_progress'|'done', owner:string, memo:string, checklist:ChecklistItem[], issues:Issue[], tokens:TokenEntry[]}`; `ChecklistItem = {id, text, done:boolean, importance:'high'|'mid'|'low'}`; `Issue = {id, text, resolved:boolean}`; `TokenEntry = {date:string, amount:number, estimated:boolean, note:string}`.

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "project-dashboard",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  },
  "devDependencies": {
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 2: 의존성 설치**

Run: `npm install`
Expected: `node_modules/jsdom` 생성, 에러 없음.

- [ ] **Step 3: 시드 데이터 작성 (`dashboard-data.json`)**

```json
{
  "version": 1,
  "groups": [
    { "id": "g_team", "name": "큰 과제", "kind": "team_goal", "order": 0 },
    { "id": "g_small", "name": "작은 과제", "kind": "small", "order": 1 },
    { "id": "g_personal", "name": "개인", "kind": "personal", "order": 2 }
  ],
  "tasks": [
    { "id": "t1", "groupId": "g_team", "name": "과제 1", "status": "in_progress", "owner": "한승", "memo": "", "checklist": [ { "id": "t1c1", "text": "설계 확정", "done": true, "importance": "high" }, { "id": "t1c2", "text": "구현", "done": false, "importance": "mid" } ], "issues": [], "tokens": [] },
    { "id": "t2", "groupId": "g_team", "name": "과제 2", "status": "todo", "owner": "미정", "memo": "", "checklist": [], "issues": [], "tokens": [] },
    { "id": "t3", "groupId": "g_team", "name": "과제 3", "status": "done", "owner": "지민", "memo": "", "checklist": [], "issues": [], "tokens": [] },
    { "id": "t4", "groupId": "g_team", "name": "과제 4", "status": "in_progress", "owner": "한승", "memo": "", "checklist": [], "issues": [], "tokens": [] },
    { "id": "t5", "groupId": "g_team", "name": "과제 5", "status": "in_progress", "owner": "수아", "memo": "", "checklist": [], "issues": [], "tokens": [] },
    { "id": "t6", "groupId": "g_team", "name": "과제 6", "status": "todo", "owner": "미정", "memo": "", "checklist": [], "issues": [], "tokens": [] },
    { "id": "s1", "groupId": "g_small", "name": "데이터 마이그레이션 CSV 정리", "status": "in_progress", "owner": "한승", "memo": "", "checklist": [], "issues": [], "tokens": [] },
    { "id": "p1", "groupId": "g_personal", "name": "주간 진행 리포트 자동화", "status": "in_progress", "owner": "한승", "memo": "", "checklist": [], "issues": [], "tokens": [] }
  ]
}
```

- [ ] **Step 4: `dashboard.html` 골격 + 시드 인라인 + 접근자 작성**

`dashboard-data.json`을 단일 파일 오프라인 동작을 위해 `<script>` 안 `SEED` 상수로 그대로 복제해 둔다(파일은 동기화용 사본). 아래를 그대로 작성:

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>프로젝트 대시보드</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #1a1a1a; }
  .grid6 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .card, .row { border: 1px solid #ddd; border-radius: 10px; padding: 12px 14px; }
  .row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 6px; }
  .bar { height: 5px; background: #eee; border-radius: 3px; overflow: hidden; }
  .bar > i { display: block; height: 100%; background: #888; }
</style>
</head>
<body>
<div id="app"></div>
<script>
(function (global) {
  "use strict";
  var SEED = {
    version: 1,
    groups: [
      { id: "g_team", name: "큰 과제", kind: "team_goal", order: 0 },
      { id: "g_small", name: "작은 과제", kind: "small", order: 1 },
      { id: "g_personal", name: "개인", kind: "personal", order: 2 }
    ],
    tasks: [
      { id: "t1", groupId: "g_team", name: "과제 1", status: "in_progress", owner: "한승", memo: "", checklist: [ { id: "t1c1", text: "설계 확정", done: true, importance: "high" }, { id: "t1c2", text: "구현", done: false, importance: "mid" } ], issues: [], tokens: [] },
      { id: "t2", groupId: "g_team", name: "과제 2", status: "todo", owner: "미정", memo: "", checklist: [], issues: [], tokens: [] },
      { id: "t3", groupId: "g_team", name: "과제 3", status: "done", owner: "지민", memo: "", checklist: [], issues: [], tokens: [] },
      { id: "t4", groupId: "g_team", name: "과제 4", status: "in_progress", owner: "한승", memo: "", checklist: [], issues: [], tokens: [] },
      { id: "t5", groupId: "g_team", name: "과제 5", status: "in_progress", owner: "수아", memo: "", checklist: [], issues: [], tokens: [] },
      { id: "t6", groupId: "g_team", name: "과제 6", status: "todo", owner: "미정", memo: "", checklist: [], issues: [], tokens: [] },
      { id: "s1", groupId: "g_small", name: "데이터 마이그레이션 CSV 정리", status: "in_progress", owner: "한승", memo: "", checklist: [], issues: [], tokens: [] },
      { id: "p1", groupId: "g_personal", name: "주간 진행 리포트 자동화", status: "in_progress", owner: "한승", memo: "", checklist: [], issues: [], tokens: [] }
    ]
  };

  function defaultData() { return JSON.parse(JSON.stringify(SEED)); }
  function tasksInGroup(data, groupId) {
    return data.tasks.filter(function (t) { return t.groupId === groupId; });
  }
  function groupByKind(data, kind) {
    return data.groups.find(function (g) { return g.kind === kind; });
  }

  var Dashboard = {
    WEIGHTS: { high: 3, mid: 2, low: 1 },
    defaultData: defaultData,
    tasksInGroup: tasksInGroup,
    groupByKind: groupByKind
  };
  global.Dashboard = Dashboard;
})(typeof window !== "undefined" ? window : this);
</script>
</body>
</html>
```

- [ ] **Step 5: 테스트 하니스 작성 (`tests/helpers.js`)**

```js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadDashboard() {
  const html = readFileSync(join(__dirname, "..", "dashboard.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://localhost/" });
  return dom.window;
}
```

- [ ] **Step 6: 접근자 실패 테스트 작성 (`tests/data.test.js`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDashboard } from "./helpers.js";

test("defaultData has 3 groups and 6 team tasks", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  assert.equal(data.groups.length, 3);
  const team = Dashboard.groupByKind(data, "team_goal");
  assert.ok(team);
  assert.equal(Dashboard.tasksInGroup(data, team.id).length, 6);
});

test("defaultData returns independent copies", () => {
  const { Dashboard } = loadDashboard();
  const a = Dashboard.defaultData();
  a.tasks[0].name = "변경됨";
  const b = Dashboard.defaultData();
  assert.notEqual(b.tasks[0].name, "변경됨");
});
```

- [ ] **Step 7: 테스트 실행**

Run: `npm test`
Expected: 2개 테스트 PASS.

- [ ] **Step 8: 커밋**

```bash
git add package.json package-lock.json dashboard.html dashboard-data.json tests/helpers.js tests/data.test.js
git commit -m "feat: scaffold dashboard with data schema, seed, and accessors"
```

---

## Task 2: 진행률 계산 (가중치 + 상태 우선 + 빈 체크리스트 폴백)

**Files:**
- Modify: `dashboard.html` (인라인 `<script>` 내 `Dashboard`에 함수 추가)
- Test: `tests/progress.test.js`

**Interfaces:**
- Consumes: `Dashboard.WEIGHTS`
- Produces: `Dashboard.statusToProgress(status)` → `0|50|100`; `Dashboard.taskProgress(task)` → 정수 `0..100`.

- [ ] **Step 1: 실패 테스트 작성 (`tests/progress.test.js`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDashboard } from "./helpers.js";

function mk(status, checklist) {
  return { id: "x", groupId: "g", name: "x", status, owner: "", memo: "", checklist, issues: [], tokens: [] };
}

test("statusToProgress maps states", () => {
  const { Dashboard } = loadDashboard();
  assert.equal(Dashboard.statusToProgress("todo"), 0);
  assert.equal(Dashboard.statusToProgress("in_progress"), 50);
  assert.equal(Dashboard.statusToProgress("done"), 100);
});

test("done status is always 100 even with incomplete checklist", () => {
  const { Dashboard } = loadDashboard();
  const t = mk("done", [{ id: "c", text: "a", done: false, importance: "high" }]);
  assert.equal(Dashboard.taskProgress(t), 100);
});

test("empty checklist falls back to status", () => {
  const { Dashboard } = loadDashboard();
  assert.equal(Dashboard.taskProgress(mk("todo", [])), 0);
  assert.equal(Dashboard.taskProgress(mk("in_progress", [])), 50);
});

test("weighted checklist: high done + mid undone + low done = 4/6 = 67", () => {
  const { Dashboard } = loadDashboard();
  const t = mk("in_progress", [
    { id: "a", text: "a", done: true, importance: "high" },
    { id: "b", text: "b", done: false, importance: "mid" },
    { id: "c", text: "c", done: true, importance: "low" }
  ]);
  assert.equal(Dashboard.taskProgress(t), 67);
});

test("all checklist items done = 100", () => {
  const { Dashboard } = loadDashboard();
  const t = mk("in_progress", [
    { id: "a", text: "a", done: true, importance: "high" },
    { id: "b", text: "b", done: true, importance: "low" }
  ]);
  assert.equal(Dashboard.taskProgress(t), 100);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `node --test tests/progress.test.js`
Expected: FAIL — `Dashboard.statusToProgress is not a function`.

- [ ] **Step 3: 최소 구현 추가 (`dashboard.html`의 `Dashboard` 정의 직전에 함수, 객체에 등록)**

```js
  function statusToProgress(status) {
    if (status === "done") return 100;
    if (status === "in_progress") return 50;
    return 0;
  }
  function taskProgress(task) {
    if (task.status === "done") return 100;
    var list = task.checklist || [];
    if (list.length === 0) return statusToProgress(task.status);
    var total = 0, done = 0;
    for (var i = 0; i < list.length; i++) {
      var w = Dashboard.WEIGHTS[list[i].importance] || Dashboard.WEIGHTS.mid;
      total += w;
      if (list[i].done) done += w;
    }
    return Math.round((done / total) * 100);
  }
```

`Dashboard` 객체 리터럴에 추가:

```js
    statusToProgress: statusToProgress,
    taskProgress: taskProgress,
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `node --test tests/progress.test.js`
Expected: 5개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add dashboard.html tests/progress.test.js
git commit -m "feat: weighted task progress with status override and empty fallback"
```

---

## Task 3: 영속성 (localStorage 저장/로드 + 내보내기/가져오기)

**Files:**
- Modify: `dashboard.html`
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes: `Dashboard.defaultData()`
- Produces: `Dashboard.loadData()` → `data`; `Dashboard.saveData(data)` → `void`(localStorage 키 `"dashboard-data"`); `Dashboard.exportData(data)` → JSON 문자열; `Dashboard.importData(jsonString)` → 검증된 `data`(필수 키 없으면 throw `Error`).

- [ ] **Step 1: 실패 테스트 작성 (`tests/storage.test.js`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDashboard } from "./helpers.js";

test("saveData then loadData round-trips", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  data.tasks[0].name = "수정됨";
  Dashboard.saveData(data);
  const loaded = Dashboard.loadData();
  assert.equal(loaded.tasks[0].name, "수정됨");
});

test("loadData returns default when storage empty", () => {
  const { Dashboard } = loadDashboard();
  const loaded = Dashboard.loadData();
  assert.equal(loaded.groups.length, 3);
});

test("exportData produces parseable JSON", () => {
  const { Dashboard } = loadDashboard();
  const str = Dashboard.exportData(Dashboard.defaultData());
  assert.equal(JSON.parse(str).version, 1);
});

test("importData rejects invalid payload", () => {
  const { Dashboard } = loadDashboard();
  assert.throws(() => Dashboard.importData('{"nope":true}'));
});

test("importData accepts valid payload", () => {
  const { Dashboard } = loadDashboard();
  const str = Dashboard.exportData(Dashboard.defaultData());
  const data = Dashboard.importData(str);
  assert.equal(data.groups.length, 3);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `node --test tests/storage.test.js`
Expected: FAIL — `Dashboard.saveData is not a function`.

- [ ] **Step 3: 최소 구현 추가 (함수 정의 + 객체 등록)**

```js
  var STORAGE_KEY = "dashboard-data";
  function saveData(data) {
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  function loadData() {
    var raw = global.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    try { return importData(raw); } catch (e) { return defaultData(); }
  }
  function exportData(data) { return JSON.stringify(data, null, 2); }
  function importData(jsonString) {
    var obj = JSON.parse(jsonString);
    if (!obj || !Array.isArray(obj.groups) || !Array.isArray(obj.tasks)) {
      throw new Error("invalid data: groups/tasks required");
    }
    return obj;
  }
```

`Dashboard` 객체에 추가:

```js
    loadData: loadData,
    saveData: saveData,
    exportData: exportData,
    importData: importData,
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `node --test tests/storage.test.js`
Expected: 5개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add dashboard.html tests/storage.test.js
git commit -m "feat: localStorage persistence with export/import validation"
```

---

## Task 4: 렌더 — 큰 과제 3×2 그리드 + 작은/개인 목록 (상태·담당 우선)

**Files:**
- Modify: `dashboard.html`
- Test: `tests/render.test.js`

**Interfaces:**
- Consumes: `Dashboard.taskProgress(task)`, `Dashboard.tasksInGroup(data, groupId)`, `Dashboard.groupByKind(data, kind)`.
- Produces: `Dashboard.render(data, rootEl)` → `void`. 렌더 결과 DOM 규약: 큰 과제 컨테이너 `.grid6` 안에 `.card[data-task-id]` 6개; 작은 과제/개인은 `.row[data-task-id]`. 각 카드/행에 상태 배지 `.badge[data-status]`(텍스트 예정/진행/완료), 담당 `.owner`, 진행률 `.bar > i`(width %) + `.pct`(텍스트). 상태·담당 요소가 진행률 요소보다 DOM 순서상 먼저 온다. 헬퍼 `statusLabel(status)`/`importanceLabel(imp)` 내부 사용.

- [ ] **Step 1: 실패 테스트 작성 (`tests/render.test.js`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDashboard } from "./helpers.js";

function setup() {
  const win = loadDashboard();
  const root = win.document.getElementById("app");
  win.Dashboard.render(win.Dashboard.defaultData(), root);
  return { win, root };
}

test("renders exactly 6 team cards in grid", () => {
  const { root } = setup();
  const grid = root.querySelector(".grid6");
  assert.ok(grid);
  assert.equal(grid.querySelectorAll(".card[data-task-id]").length, 6);
});

test("renders small and personal task rows", () => {
  const { root } = setup();
  assert.equal(root.querySelectorAll('.row[data-task-id="s1"]').length, 1);
  assert.equal(root.querySelectorAll('.row[data-task-id="p1"]').length, 1);
});

test("status badge shows Korean label", () => {
  const { root } = setup();
  const card = root.querySelector('.card[data-task-id="t3"]');
  assert.equal(card.querySelector(".badge").textContent.trim(), "완료");
});

test("status/owner appear before progress in DOM order", () => {
  const { root } = setup();
  const card = root.querySelector('.card[data-task-id="t1"]');
  const html = card.innerHTML;
  assert.ok(html.indexOf("badge") < html.indexOf("bar"));
  assert.ok(html.indexOf("owner") < html.indexOf("bar"));
});

test("done task shows 100% bar", () => {
  const { root } = setup();
  const card = root.querySelector('.card[data-task-id="t3"]');
  assert.equal(card.querySelector(".pct").textContent.trim(), "100%");
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `node --test tests/render.test.js`
Expected: FAIL — `Dashboard.render is not a function`.

- [ ] **Step 3: 최소 구현 추가 (함수 정의 + 객체 등록)**

```js
  function statusLabel(s) { return s === "done" ? "완료" : s === "in_progress" ? "진행" : "예정"; }
  function importanceLabel(i) { return i === "high" ? "상" : i === "low" ? "하" : "중"; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function metaHtml(task) {
    return '<span class="badge" data-status="' + task.status + '">' + statusLabel(task.status) + "</span>" +
      '<span class="owner">' + esc(task.owner || "미정") + "</span>";
  }
  function barHtml(task) {
    var p = taskProgress(task);
    return '<div class="bar"><i style="width:' + p + '%"></i></div><span class="pct">' + p + "%</span>";
  }

  function render(data, rootEl) {
    var team = groupByKind(data, "team_goal");
    var small = groupByKind(data, "small");
    var personal = groupByKind(data, "personal");
    var html = "";

    html += "<h2>" + esc(team.name) + " (6)</h2><div class=\"grid6\">";
    tasksInGroup(data, team.id).forEach(function (t) {
      html += '<div class="card" data-task-id="' + t.id + '"><div class="t-name">' + esc(t.name) +
        '</div><div class="meta">' + metaHtml(t) + "</div>" + barHtml(t) + "</div>";
    });
    html += "</div>";

    [small, personal].forEach(function (g) {
      if (!g) return;
      html += "<h2>" + esc(g.name) + "</h2>";
      tasksInGroup(data, g.id).forEach(function (t) {
        html += '<div class="row" data-task-id="' + t.id + '">' + metaHtml(t) +
          '<span class="r-name">' + esc(t.name) + "</span>" + barHtml(t) + "</div>";
      });
    });

    rootEl.innerHTML = html;
  }
```

`Dashboard` 객체에 추가:

```js
    render: render,
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `node --test tests/render.test.js`
Expected: 5개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add dashboard.html tests/render.test.js
git commit -m "feat: render 3x2 team grid plus small/personal lists, status-first"
```

---

## Task 5: 편집 — 펼침 편집(상태·담당·체크리스트 중요도·문제점·메모) + 자동저장

**Files:**
- Modify: `dashboard.html`
- Test: `tests/edit.test.js`

**Interfaces:**
- Consumes: `Dashboard.render`, `Dashboard.saveData`, `Dashboard.loadData`, `Dashboard.taskProgress`.
- Produces: `Dashboard.init(rootEl)` → `void`(현재 데이터를 모듈 상태에 보관, 렌더, 클릭/입력 이벤트 위임 바인딩). 동작: 카드/행 클릭 시 `.editor[data-task-id]` 펼침; 체크박스 토글·중요도 select 변경·상태 select 변경·담당 input·메모 textarea·문제점 추가가 모듈 상태를 수정하고 `saveData` 호출 후 `render` 재실행. 테스트 편의용으로 모듈 상태를 변경하는 순수 변이 함수도 노출: `Dashboard.toggleChecklistItem(data, taskId, itemId)`, `Dashboard.setChecklistImportance(data, taskId, itemId, importance)`, `Dashboard.setTaskStatus(data, taskId, status)` — 모두 `data`를 제자리 수정하고 `data` 반환.

- [ ] **Step 1: 실패 테스트 작성 (`tests/edit.test.js`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDashboard } from "./helpers.js";

test("toggleChecklistItem flips done and updates progress", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  const before = Dashboard.taskProgress(data.tasks.find(t => t.id === "t1"));
  Dashboard.toggleChecklistItem(data, "t1", "t1c2");
  const after = Dashboard.taskProgress(data.tasks.find(t => t.id === "t1"));
  assert.notEqual(after, before);
  assert.equal(after, 100);
});

test("setChecklistImportance changes weight", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  Dashboard.setChecklistImportance(data, "t1", "t1c2", "low");
  assert.equal(data.tasks.find(t => t.id === "t1").checklist.find(c => c.id === "t1c2").importance, "low");
});

test("setTaskStatus to done forces 100", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  Dashboard.setTaskStatus(data, "t1", "done");
  assert.equal(Dashboard.taskProgress(data.tasks.find(t => t.id === "t1")), 100);
});

test("init renders and persists on status change via select", () => {
  const win = loadDashboard();
  const { Dashboard, document } = win;
  Dashboard.init(document.getElementById("app"));
  const card = document.querySelector('.card[data-task-id="t2"]');
  card.dispatchEvent(new win.Event("click", { bubbles: true }));
  const sel = document.querySelector('.editor[data-task-id="t2"] select.status');
  sel.value = "done";
  sel.dispatchEvent(new win.Event("change", { bubbles: true }));
  const saved = JSON.parse(win.localStorage.getItem("dashboard-data"));
  assert.equal(saved.tasks.find(t => t.id === "t2").status, "done");
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `node --test tests/edit.test.js`
Expected: FAIL — `Dashboard.toggleChecklistItem is not a function`.

- [ ] **Step 3: 변이 함수 + 에디터 렌더 + init 이벤트 위임 구현**

변이 함수(객체에 등록):

```js
  function findTask(data, taskId) { return data.tasks.find(function (t) { return t.id === taskId; }); }
  function toggleChecklistItem(data, taskId, itemId) {
    var t = findTask(data, taskId); if (!t) return data;
    var it = t.checklist.find(function (c) { return c.id === itemId; });
    if (it) it.done = !it.done;
    return data;
  }
  function setChecklistImportance(data, taskId, itemId, importance) {
    var t = findTask(data, taskId); if (!t) return data;
    var it = t.checklist.find(function (c) { return c.id === itemId; });
    if (it) it.importance = importance;
    return data;
  }
  function setTaskStatus(data, taskId, status) {
    var t = findTask(data, taskId); if (t) t.status = status;
    return data;
  }
```

에디터 마크업: `render`에서 각 카드/행 내부 끝에 펼침 영역을 추가한다. `barHtml(t)` 뒤에 다음을 덧붙이도록 `render`를 수정:

```js
  function editorHtml(t) {
    var rows = t.checklist.map(function (c) {
      return '<label class="cl-item"><input type="checkbox" class="cl-done" data-item-id="' + c.id + '"' +
        (c.done ? " checked" : "") + ">" + esc(c.text) +
        '<select class="cl-imp" data-item-id="' + c.id + '">' +
        ['high','mid','low'].map(function (v) {
          return '<option value="' + v + '"' + (c.importance === v ? " selected" : "") + ">" + importanceLabel(v) + "</option>";
        }).join("") + "</select></label>";
    }).join("");
    return '<div class="editor" data-task-id="' + t.id + '" hidden>' +
      '<select class="status">' + ['todo','in_progress','done'].map(function (v) {
        return '<option value="' + v + '"' + (t.status === v ? " selected" : "") + ">" + statusLabel(v) + "</option>";
      }).join("") + "</select>" +
      '<input class="owner-input" value="' + esc(t.owner) + '">' +
      '<div class="checklist">' + rows + "</div>" +
      '<textarea class="memo">' + esc(t.memo) + "</textarea></div>";
  }
```

`render` 내 카드/행 문자열에서 `barHtml(t)` 뒤에 `+ editorHtml(t)`를 추가한다(카드·행 두 곳 모두).

init + 이벤트 위임(객체에 `init` 등록):

```js
  var _state = null, _root = null;
  function rerender() { render(_state, _root); }
  function openEditor(taskId) {
    var ed = _root.querySelector('.editor[data-task-id="' + taskId + '"]');
    if (ed) ed.hidden = !ed.hidden;
  }
  function persist() { saveData(_state); }
  function closestTaskId(el) {
    var n = el.closest("[data-task-id]");
    return n ? n.getAttribute("data-task-id") : null;
  }
  function init(rootEl) {
    _root = rootEl;
    _state = loadData();
    render(_state, _root);
    rootEl.addEventListener("click", function (e) {
      if (e.target.closest(".editor")) return;
      var card = e.target.closest(".card, .row");
      if (card) openEditor(card.getAttribute("data-task-id"));
    });
    rootEl.addEventListener("change", function (e) {
      var taskId = closestTaskId(e.target);
      if (!taskId) return;
      if (e.target.classList.contains("status")) setTaskStatus(_state, taskId, e.target.value);
      else if (e.target.classList.contains("cl-done")) toggleChecklistItem(_state, taskId, e.target.getAttribute("data-item-id"));
      else if (e.target.classList.contains("cl-imp")) setChecklistImportance(_state, taskId, e.target.getAttribute("data-item-id"), e.target.value);
      else return;
      persist(); rerender(); openEditor(taskId);
    });
    rootEl.addEventListener("input", function (e) {
      var taskId = closestTaskId(e.target);
      if (!taskId) return;
      var t = findTask(_state, taskId); if (!t) return;
      if (e.target.classList.contains("owner-input")) t.owner = e.target.value;
      else if (e.target.classList.contains("memo")) t.memo = e.target.value;
      else return;
      persist();
    });
  }
```

`Dashboard` 객체에 추가:

```js
    toggleChecklistItem: toggleChecklistItem,
    setChecklistImportance: setChecklistImportance,
    setTaskStatus: setTaskStatus,
    init: init,
```

마지막으로 `<script>` 끝(IIFE 내, `global.Dashboard = Dashboard;` 뒤)에 자동 부팅 추가:

```js
  if (typeof document !== "undefined") {
    var el = document.getElementById("app");
    if (el) Dashboard.init(el);
  }
```

> 주의: `render`가 `innerHTML`을 다시 쓰면 펼침 상태가 닫힌다. `change` 핸들러에서 `rerender()` 후 `openEditor(taskId)`를 호출해 해당 에디터를 다시 펼친다(위 코드에 반영됨).

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `node --test tests/edit.test.js`
Expected: 4개 테스트 PASS.

- [ ] **Step 5: 전체 테스트 실행**

Run: `npm test`
Expected: 전체(데이터/진행률/저장/렌더/편집) PASS.

- [ ] **Step 6: 커밋**

```bash
git add dashboard.html tests/edit.test.js
git commit -m "feat: expandable task editor with status/owner/checklist-importance and autosave"
```

---

## Task 6: 내보내기/가져오기 UI + 최종 통합 검증

**Files:**
- Modify: `dashboard.html`
- Test: `tests/edit.test.js` (통합 케이스 추가)

**Interfaces:**
- Consumes: `Dashboard.exportData`, `Dashboard.importData`, `Dashboard.saveData`, `Dashboard.init`.
- Produces: 헤더에 `#export-btn`, `#import-input`(`type=file`) 추가. export 클릭 시 `exportData(_state)`로 Blob 다운로드; import 시 파일 텍스트를 `importData`로 검증→`_state` 교체→`persist`→`rerender`.

- [ ] **Step 1: 통합 실패 테스트 추가 (`tests/edit.test.js` 끝에)**

```js
test("export button exists and import replaces state", () => {
  const win = loadDashboard();
  const { Dashboard, document } = win;
  Dashboard.init(document.getElementById("app"));
  assert.ok(document.getElementById("export-btn"));
  const replacement = Dashboard.defaultData();
  replacement.tasks[0].name = "가져온 과제";
  Dashboard.applyImportedJson(Dashboard.exportData(replacement));
  const saved = JSON.parse(win.localStorage.getItem("dashboard-data"));
  assert.equal(saved.tasks[0].name, "가져온 과제");
  assert.ok(document.querySelector('.card[data-task-id="t1"] .t-name').textContent.includes("가져온 과제"));
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `node --test tests/edit.test.js`
Expected: FAIL — `#export-btn` 없음 / `applyImportedJson` 미정의.

- [ ] **Step 3: 구현 — 헤더 버튼 마크업 + applyImportedJson + 이벤트**

`render` 시작 부분 `html` 누적 첫 줄을 다음으로 교체(헤더 추가):

```js
    var html = '<div class="toolbar"><button id="export-btn">내보내기</button>' +
      '<input id="import-input" type="file" accept="application/json"></div>';
```

(기존 첫 `html += "<h2>..."`는 `html +=`로 그대로 이어짐)

`applyImportedJson` + 이벤트(객체에 `applyImportedJson` 등록):

```js
  function applyImportedJson(jsonString) {
    _state = importData(jsonString);
    persist();
    rerender();
    return _state;
  }
```

`init`의 `click` 핸들러 안, 카드 열기 분기 앞에 추가:

```js
      if (e.target.id === "export-btn") {
        var blob = new global.Blob([exportData(_state)], { type: "application/json" });
        var url = global.URL.createObjectURL(blob);
        var a = global.document.createElement("a");
        a.href = url; a.download = "dashboard-data.json"; a.click();
        global.URL.revokeObjectURL(url);
        return;
      }
```

`init` 끝에 import 핸들러 추가:

```js
    rootEl.addEventListener("change", function (e) {
      if (e.target.id !== "import-input" || !e.target.files || !e.target.files[0]) return;
      e.target.files[0].text().then(function (txt) {
        try { applyImportedJson(txt); } catch (err) { global.alert("가져오기 실패: " + err.message); }
      });
    });
```

`Dashboard` 객체에 추가:

```js
    applyImportedJson: applyImportedJson,
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `node --test tests/edit.test.js`
Expected: 통합 케이스 포함 PASS.

- [ ] **Step 5: 전체 테스트 실행 (최종 검증)**

Run: `npm test`
Expected: 모든 테스트 PASS, 0 실패.

- [ ] **Step 6: 브라우저 수동 점검(오프라인 확인)**

`dashboard.html`을 파일 프로토콜(`file://`)로 직접 열어 큰 과제 6개 3×2, 작은/개인 목록, 카드 클릭 시 편집, 새로고침 후에도 변경 유지(localStorage)되는지 확인. 네트워크 요청 0건이어야 함.

- [ ] **Step 7: 커밋**

```bash
git add dashboard.html tests/edit.test.js
git commit -m "feat: export/import UI and final integration verification"
```

---

## Self-Review

**1. Spec coverage**
- 3그룹 단일 모델(team_goal/small/personal) → Task 1 시드·접근자. ✓
- 큰 과제 6개 3×2 그리드 → Task 4 `.grid6` + 6 카드 테스트. ✓
- 작은/개인 목록 → Task 4 `.row` 테스트. ✓
- 그룹 합산 % 없음 → 어떤 태스크도 group progress를 계산하지 않음(렌더는 과제 `barHtml`만). ✓
- 과제 진행률 = 가중 평균, status=done→100, 빈 체크리스트 폴백 → Task 2. ✓
- 중요도 상/중/하 선택 → Task 5 `cl-imp` select + `setChecklistImportance`. ✓
- 상태/담당 우선 표시 → Task 4 DOM 순서 테스트. ✓
- 오프라인 단일 파일 + localStorage + 내보내기/가져오기 → Task 1/3/6. ✓
- 헤드리스(jsdom) 검증 → 전 태스크 테스트. ✓

**2. Placeholder scan:** TODO/TBD/"적절히 처리" 없음. 모든 코드 스텝에 실제 코드 포함. ✓

**3. Type consistency:** `status` 값 `todo/in_progress/done`, `importance` `high/mid/low` 전 태스크 일치. 함수명 `taskProgress`/`statusToProgress`/`toggleChecklistItem`/`setChecklistImportance`/`setTaskStatus`/`render`/`init`/`applyImportedJson` 정의·사용 일치. localStorage 키 `"dashboard-data"` 통일. ✓

남은 미구현(스펙상 후속): issues 추가/편집 UI, tokens 기록·차트, 검색·필터 — 이번 구조 스펙 범위 밖(시각화 스펙에서 진행).
