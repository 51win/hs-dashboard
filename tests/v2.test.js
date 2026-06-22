import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDashboard } from "./helpers.js";

test("addChecklistItem appends a new item with defaults and returns id", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  const t2 = data.tasks.find(t => t.id === "t2");
  assert.equal(t2.checklist.length, 0);
  const id = Dashboard.addChecklistItem(data, "t2");
  assert.ok(id);
  assert.equal(t2.checklist.length, 1);
  const it = t2.checklist[0];
  assert.equal(it.id, id);
  assert.equal(it.done, false);
  assert.equal(it.importance, "mid");
  assert.equal(it.note, "");
  assert.equal(it.due, "");
  assert.equal(it.doneAt, "");
});

test("removeChecklistItem deletes the item", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  Dashboard.removeChecklistItem(data, "t1", "t1c2");
  const t1 = data.tasks.find(t => t.id === "t1");
  assert.equal(t1.checklist.length, 1);
  assert.equal(t1.checklist[0].id, "t1c1");
});

test("setChecklistNote and setChecklistDue update item", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  Dashboard.setChecklistNote(data, "t1", "t1c1", "메모");
  Dashboard.setChecklistDue(data, "t1", "t1c1", "2026-07-01");
  const it = data.tasks.find(t => t.id === "t1").checklist.find(c => c.id === "t1c1");
  assert.equal(it.note, "메모");
  assert.equal(it.due, "2026-07-01");
});

test("toggleChecklistItem sets and clears doneAt", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  // t1c2 starts not done
  Dashboard.toggleChecklistItem(data, "t1", "t1c2");
  let it = data.tasks.find(t => t.id === "t1").checklist.find(c => c.id === "t1c2");
  assert.equal(it.done, true);
  assert.equal(it.doneAt, Dashboard.todayStr());
  Dashboard.toggleChecklistItem(data, "t1", "t1c2");
  it = data.tasks.find(t => t.id === "t1").checklist.find(c => c.id === "t1c2");
  assert.equal(it.done, false);
  assert.equal(it.doneAt, "");
});

test("setTaskName edits name", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  Dashboard.setTaskName(data, "t1", "새 이름");
  assert.equal(data.tasks.find(t => t.id === "t1").name, "새 이름");
});

test("ddayLabel handles D-DAY, future, past, and empty", () => {
  const { Dashboard } = loadDashboard();
  assert.equal(Dashboard.ddayLabel("2026-06-22", "2026-06-22"), "D-DAY");
  assert.equal(Dashboard.ddayLabel("2026-06-27", "2026-06-22"), "D-5");
  assert.equal(Dashboard.ddayLabel("2026-06-19", "2026-06-22"), "D+3");
  assert.equal(Dashboard.ddayLabel("", "2026-06-22"), "");
});

test("isUrgent: overdue true, 1 day true, 5 days false, empty false", () => {
  const { Dashboard } = loadDashboard();
  assert.equal(Dashboard.isUrgent("2026-06-20", "2026-06-22"), true); // overdue
  assert.equal(Dashboard.isUrgent("2026-06-23", "2026-06-22"), true); // 1 day
  assert.equal(Dashboard.isUrgent("2026-06-22", "2026-06-22"), true); // today
  assert.equal(Dashboard.isUrgent("2026-06-27", "2026-06-22"), false); // 5 days
  assert.equal(Dashboard.isUrgent("", "2026-06-22"), false);
});

test("collectToday buckets items correctly", () => {
  const { Dashboard } = loadDashboard();
  const today = "2026-06-22"; // Monday
  const data = {
    groups: [],
    tasks: [
      { id: "x", name: "과제X", checklist: [
        { id: "a", text: "오늘기한", done: false, importance: "mid", due: "2026-06-22", doneAt: "" },
        { id: "b", text: "오늘완료", done: true, importance: "mid", due: "", doneAt: "2026-06-22" },
        { id: "c", text: "이번주", done: false, importance: "mid", due: "2026-06-25", doneAt: "" },
        { id: "d", text: "다음주", done: false, importance: "mid", due: "2026-07-01", doneAt: "" },
        { id: "e", text: "완료된오늘기한", done: true, importance: "mid", due: "2026-06-22", doneAt: "2026-06-22" }
      ], tokens: [] }
    ]
  };
  const r = Dashboard.collectToday(data, today);
  assert.deepEqual([...r.dueToday].map(x => x.item.id), ["a"]);
  assert.deepEqual([...r.doneToday].map(x => x.item.id).sort(), ["b", "e"]);
  // dueThisWeek includes a (today) and c, not d (next week), not e (done)
  assert.deepEqual([...r.dueThisWeek].map(x => x.item.id).sort(), ["a", "c"]);
  assert.equal(r.dueToday[0].taskName, "과제X");
});

test("taskTokenTotal sums token entries", () => {
  const { Dashboard } = loadDashboard();
  assert.equal(Dashboard.taskTokenTotal({ tokens: [] }), 0);
  assert.equal(Dashboard.taskTokenTotal({}), 0);
  assert.equal(Dashboard.taskTokenTotal({ tokens: [{ tokens: 10 }, { tokens: 5 }] }), 15);
});

test("dailyTokenSeries returns [] when undefined and sorted when set", () => {
  const win = loadDashboard();
  assert.equal(win.Dashboard.dailyTokenSeries().length, 0);
  win.DASHBOARD_TOKENS = { daily: [
    { date: "2026-06-22", tokens: 30 },
    { date: "2026-06-20", tokens: 10 },
    { date: "2026-06-21", tokens: 20 }
  ] };
  const s = win.Dashboard.dailyTokenSeries();
  assert.deepEqual([...s].map(d => d.date), ["2026-06-20", "2026-06-21", "2026-06-22"]);
});

test("setTab switches rendered view", () => {
  const win = loadDashboard();
  const { Dashboard, document } = win;
  Dashboard.init(document.getElementById("app"));
  assert.ok(document.querySelector(".grid6"), "board shows grid6");

  Dashboard.setTab("today");
  assert.equal(document.querySelector(".grid6"), null, "today hides grid6");
  assert.ok(document.querySelector(".today-list") || document.querySelector("h2"), "today shows sections");
  const headings = [...document.querySelectorAll("h2")].map(h => h.textContent);
  assert.ok(headings.some(h => h.includes("오늘 할 일")));

  Dashboard.setTab("tokens");
  assert.equal(document.querySelector(".grid6"), null);
  assert.ok(document.querySelector("svg") || document.querySelector(".empty"), "tokens shows svg or empty");
});

test("tokens tab renders svg data points when DASHBOARD_TOKENS set", () => {
  const win = loadDashboard();
  const { Dashboard, document } = win;
  win.DASHBOARD_TOKENS = { daily: [
    { date: "2026-06-20", tokens: 10 },
    { date: "2026-06-21", tokens: 20 }
  ] };
  Dashboard.init(document.getElementById("app"));
  Dashboard.setTab("tokens");
  const svg = document.querySelector("svg.chart");
  assert.ok(svg, "trend chart svg exists");
  assert.ok(svg.querySelectorAll("rect").length >= 2, "renders bars for data points");
});

test("editor exposes name-input, cl-note, cl-due, cl-del, cl-add", () => {
  const win = loadDashboard();
  const { Dashboard, document } = win;
  Dashboard.init(document.getElementById("app"));
  const ed = document.querySelector('.editor[data-task-id="t1"]');
  assert.ok(ed.querySelector(".name-input"));
  assert.ok(ed.querySelector(".cl-note"));
  assert.ok(ed.querySelector(".cl-due"));
  assert.ok(ed.querySelector(".cl-del"));
  assert.ok(ed.querySelector(".cl-add"));
});
