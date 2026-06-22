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
