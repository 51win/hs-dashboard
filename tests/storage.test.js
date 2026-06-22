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
