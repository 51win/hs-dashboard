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

test("cards and rows are keyboard-focusable", () => {
  const win = loadDashboard();
  const { Dashboard, document } = win;
  Dashboard.init(document.getElementById("app"));
  assert.equal(document.querySelector('.card[data-task-id="t1"]').getAttribute("tabindex"), "0");
  assert.equal(document.querySelector('.row[data-task-id="p1"]').getAttribute("tabindex"), "0");
});

test("Enter key on a card opens its editor", () => {
  const win = loadDashboard();
  const { Dashboard, document } = win;
  Dashboard.init(document.getElementById("app"));
  const card = document.querySelector('.card[data-task-id="t1"]');
  const ev = new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true });
  card.dispatchEvent(ev);
  assert.equal(document.querySelector('.editor[data-task-id="t1"]').hidden, false);
});

test("저장 버튼을 누르면 해당 편집 칸이 닫힌다", () => {
  const win = loadDashboard();
  const { Dashboard, document } = win;
  Dashboard.init(document.getElementById("app"));
  const card = document.querySelector('.card[data-task-id="t1"]');
  card.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert.equal(document.querySelector('.editor[data-task-id="t1"]').hidden, false, "열림");
  const save = document.querySelector('.editor[data-task-id="t1"] .save-btn');
  save.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert.equal(document.querySelector('.editor[data-task-id="t1"]').hidden, true, "저장 후 닫힘");
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
