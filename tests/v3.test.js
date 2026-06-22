import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDashboard } from "./helpers.js";

test("addSmallTask creates a task in the small group with task-level fields", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  const small = Dashboard.groupByKind(data, "small");
  const before = Dashboard.tasksInGroup(data, small.id).length;
  const id = Dashboard.addSmallTask(data);
  assert.ok(id);
  const after = Dashboard.tasksInGroup(data, small.id);
  assert.equal(after.length, before + 1);
  const t = after.find(x => x.id === id);
  assert.equal(t.status, "todo");
  assert.equal(t.due, "");
  assert.equal(t.doneAt, "");
});

test("toggleSmallDone flips status and sets/clears doneAt", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  Dashboard.toggleSmallDone(data, "s1");
  let t = data.tasks.find(x => x.id === "s1");
  assert.equal(t.status, "done");
  assert.equal(t.doneAt, Dashboard.todayStr());
  Dashboard.toggleSmallDone(data, "s1");
  t = data.tasks.find(x => x.id === "s1");
  assert.equal(t.status, "todo");
  assert.equal(t.doneAt, "");
});

test("setTaskDue sets a task-level due date", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  Dashboard.setTaskDue(data, "s1", "2026-07-01");
  assert.equal(data.tasks.find(x => x.id === "s1").due, "2026-07-01");
});

test("removeTask deletes a task", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  const n = data.tasks.length;
  Dashboard.removeTask(data, "s1");
  assert.equal(data.tasks.length, n - 1);
  assert.equal(data.tasks.find(x => x.id === "s1"), undefined);
});

test("collectToday includes small-group tasks as items", () => {
  const { Dashboard } = loadDashboard();
  const today = "2026-06-22";
  const data = {
    groups: [{ id: "g_small", kind: "small", name: "작은 과제" }],
    tasks: [
      { id: "s1", groupId: "g_small", name: "오늘마감", status: "todo", due: "2026-06-22", doneAt: "", checklist: [], tokens: [] },
      { id: "s2", groupId: "g_small", name: "오늘끝냄", status: "done", due: "", doneAt: "2026-06-22", checklist: [], tokens: [] },
      { id: "s3", groupId: "g_small", name: "이번주", status: "todo", due: "2026-06-25", doneAt: "", checklist: [], tokens: [] }
    ]
  };
  const r = Dashboard.collectToday(data, today);
  assert.deepEqual([...r.dueToday].map(x => x.taskId), ["s1"]);
  assert.deepEqual([...r.doneToday].map(x => x.taskId), ["s2"]);
  assert.deepEqual([...r.dueThisWeek].map(x => x.taskId).sort(), ["s1", "s3"]);
  assert.equal(r.dueToday[0].taskName, "작은 과제");
  assert.equal(r.dueToday[0].item.text, "오늘마감");
});

test("editor has a save button", () => {
  const win = loadDashboard();
  const { Dashboard, document } = win;
  Dashboard.init(document.getElementById("app"));
  const ed = document.querySelector('.editor[data-task-id="t1"]');
  assert.ok(ed.querySelector(".save-btn"), "save button present");
});

test("small group renders as checklist rows with add button", () => {
  const win = loadDashboard();
  const { Dashboard, document } = win;
  Dashboard.init(document.getElementById("app"));
  assert.ok(document.querySelector('.small-row[data-task-id="s1"]'), "small row rendered");
  assert.ok(document.querySelector('.small-row .sm-done'), "small row has checkbox");
  assert.ok(document.querySelector('.small-row .sm-name'), "small row has editable name");
  assert.ok(document.querySelector('.sm-add'), "add-small button present");
  // small tasks should NOT render the nested task editor
  assert.equal(document.querySelector('.small-row .editor'), null, "no nested editor in small row");
});
