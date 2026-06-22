import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDashboard } from "./helpers.js";

test("sheetCsvUrl returns the exact gviz URL", () => {
  const win = loadDashboard();
  const url = win.Dashboard.sheetCsvUrl("ABC123", "Tasks");
  assert.equal(
    url,
    "https://docs.google.com/spreadsheets/d/ABC123/gviz/tq?tqx=out:csv&sheet=Tasks"
  );
  assert.ok(url.indexOf("ABC123") !== -1);
  assert.ok(url.indexOf("sheet=Tasks") !== -1);
  // tab name encoded
  const url2 = win.Dashboard.sheetCsvUrl("ABC123", "My Tab");
  assert.ok(url2.indexOf("sheet=My%20Tab") !== -1);
});

test("parseCsv handles quoted comma, escaped quote, and newline; ignores trailing newline", () => {
  const text = 'a,"b,c","d""e","line1\nline2"\n1,2,3,4\n';
  const rows = win_parse(text);
  assert.equal(rows.length, 2);
  // compare via JSON to avoid cross-realm reference checks (jsdom arrays)
  assert.equal(JSON.stringify(rows[0]), JSON.stringify(["a", "b,c", 'd"e', "line1\nline2"]));
  assert.equal(JSON.stringify(rows[1]), JSON.stringify(["1", "2", "3", "4"]));
});

test("parseCsv empty input returns []", () => {
  const win = loadDashboard();
  assert.equal(win.Dashboard.parseCsv("").length, 0);
});

function win_parse(text) {
  const win = loadDashboard();
  return win.Dashboard.parseCsv(text);
}

const TASKS_CSV =
  "id,group,name,status,owner,due,doneAt,memo\n" +
  "t1,team_goal,팀 과제,in_progress,한승,2026-07-01,,메모1\n" +
  "s1,small,작은 과제,todo,지민,2026-06-30,,\n" +
  "p1,personal,개인 과제,done,수아,,2026-06-20,\n";

const CHECKLIST_CSV =
  "taskId,id,text,note,importance,done,due,doneAt\n" +
  "t1,t1c1,설계,설명,high,TRUE,,2026-06-21\n" +
  "t1,t1c2,구현,,mid,false,,\n" +
  "tX,tXc1,고아항목,,low,true,,\n";

test("parseSheetData maps groups, status, checklist with done boolean + importance", () => {
  const win = loadDashboard();
  const data = win.Dashboard.parseSheetData(TASKS_CSV, CHECKLIST_CSV);
  assert.equal(data.version, 1);
  assert.equal(data.groups.length, 3);
  assert.equal(
    data.groups.map((g) => g.id).join(","),
    "g_team,g_small,g_personal"
  );

  const t1 = data.tasks.find((t) => t.id === "t1");
  const s1 = data.tasks.find((t) => t.id === "s1");
  const p1 = data.tasks.find((t) => t.id === "p1");
  assert.equal(t1.groupId, "g_team");
  assert.equal(s1.groupId, "g_small");
  assert.equal(p1.groupId, "g_personal");
  assert.equal(t1.status, "in_progress");
  assert.equal(p1.status, "done");

  // two checklist items attached to t1; orphan ignored
  assert.equal(t1.checklist.length, 2);
  assert.equal(t1.checklist[0].done, true);
  assert.equal(t1.checklist[0].importance, "high");
  assert.equal(t1.checklist[1].done, false);
  assert.equal(t1.checklist[1].importance, "mid");

  // taskProgress works on result (high done=3, mid not done=2 => 3/5 = 60)
  assert.equal(win.Dashboard.taskProgress(t1), 60);
});

test("read-only render via applySheetData hides editors and shows banner", () => {
  const win = loadDashboard();
  const root = win.document.getElementById("app");
  win.Dashboard.init(root);
  win.Dashboard.applySheetData(
    win.Dashboard.parseSheetData(TASKS_CSV, CHECKLIST_CSV)
  );
  assert.ok(root.querySelector(".sheet-banner"));
  assert.ok(root.querySelector(".grid6"));
  assert.equal(root.querySelectorAll(".save-btn").length, 0);
  assert.equal(root.querySelectorAll(".cl-add").length, 0);
  assert.equal(root.querySelectorAll(".sm-add").length, 0);
  // export button hidden/absent in read-only mode
  assert.equal(root.querySelectorAll("#export-btn").length, 0);
});

test("getSheetId/setSheetId/clearSheetId round-trip via localStorage", () => {
  const win = loadDashboard();
  assert.equal(win.Dashboard.getSheetId(), "");
  win.Dashboard.setSheetId("SHEET-42");
  assert.equal(win.Dashboard.getSheetId(), "SHEET-42");
  assert.equal(win.localStorage.getItem("dashboard-sheet-id"), "SHEET-42");
  win.Dashboard.clearSheetId();
  assert.equal(win.Dashboard.getSheetId(), "");
});
