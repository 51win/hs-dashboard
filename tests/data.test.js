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
