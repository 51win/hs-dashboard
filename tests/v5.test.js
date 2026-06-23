import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDashboard } from "./helpers.js";

test("dataToSheetRows maps groups, tasks, and checklist to sheet rows", () => {
  const { Dashboard } = loadDashboard();
  const data = Dashboard.defaultData();
  const rows = Dashboard.dataToSheetRows(data);
  // 9 seed tasks
  assert.equal(rows.tasks.length, 9);
  const t1 = rows.tasks.find(r => r.id === "t1");
  assert.equal(t1.group, "team_goal");
  const s1 = rows.tasks.find(r => r.id === "s1");
  assert.equal(s1.group, "small");
  const p1 = rows.tasks.find(r => r.id === "p1");
  assert.equal(p1.group, "personal");
  // checklist: t1 has 2 items
  assert.equal(rows.checklist.length, 2);
  const c1 = rows.checklist.find(c => c.id === "t1c1");
  assert.equal(c1.taskId, "t1");
  assert.equal(c1.done, "TRUE");
  const c2 = rows.checklist.find(c => c.id === "t1c2");
  assert.equal(c2.done, "FALSE");
});

test("dataToSheetRows round-trips through parseSheetData", () => {
  const { Dashboard } = loadDashboard();
  const original = Dashboard.defaultData();
  const rows = Dashboard.dataToSheetRows(original);
  const toCsv = (header, arr) =>
    [header.join(",")].concat(arr.map(r => header.map(h => {
      const v = r[h] == null ? "" : String(r[h]);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(","))).join("\n");
  const tasksCsv = toCsv(["id","group","name","status","owner","due","doneAt","memo"], rows.tasks);
  const clCsv = toCsv(["taskId","id","text","note","importance","done","due","doneAt"], rows.checklist);
  const parsed = Dashboard.parseSheetData(tasksCsv, clCsv);
  assert.equal(parsed.tasks.length, 9);
  assert.equal(parsed.tasks.find(t => t.id === "t1").checklist.length, 2);
  assert.equal(parsed.tasks.find(t => t.id === "t1").checklist.find(c => c.id === "t1c1").done, true);
});

test("view 모드는 편집 UI가 없고 읽기 배너+새로고침만 보인다", () => {
  const win = loadDashboard("view");
  const { Dashboard, document } = win;
  Dashboard.init(document.getElementById("app"));
  const parsed = Dashboard.parseSheetData(
    'id,group,name,status,owner,due,doneAt,memo\nt1,team_goal,A,todo,한승,,,\n',
    'taskId,id,text,note,importance,done,due,doneAt\n'
  );
  Dashboard.applySheetData(parsed);
  const root = document.getElementById("app");
  assert.equal(root.querySelector(".save-btn"), null, "뷰어는 편집 저장 버튼 없음");
  assert.equal(root.querySelector(".sm-add"), null, "뷰어는 추가 버튼 없음");
  assert.equal(root.querySelector(".admin-save"), null, "뷰어는 게시 버튼 없음");
  assert.equal(root.querySelector("#export-btn"), null, "뷰어는 내보내기 없음");
  assert.ok(root.querySelector(".sheet-banner"), "읽기 배너");
  assert.ok(root.querySelector(".sheet-refresh"), "새로고침 버튼");
});

test("edit 모드는 편집 UI + 게시/불러오기 버튼이 보이고 비밀번호 버튼은 없다", () => {
  const win = loadDashboard("edit");
  const { Dashboard, document } = win;
  Dashboard.init(document.getElementById("app"));
  const root = document.getElementById("app");
  assert.ok(root.querySelector(".sheet-banner.admin"), "편집 배너");
  assert.ok(root.querySelector(".admin-save"), "지금 게시 버튼");
  assert.ok(root.querySelector(".sheet-pull"), "시트에서 불러오기 버튼");
  assert.ok(root.querySelector(".save-btn"), "편집 저장 버튼");
  assert.ok(root.querySelector(".sm-add"), "작은 과제 추가 버튼");
  assert.equal(root.querySelector(".pw-set"), null, "비밀번호 버튼 없음");
  assert.equal(Dashboard.mode(), "edit");
});

test("edit 모드: 게시 주소가 없으면 안내 메시지를 보인다(공유 코어 단독)", () => {
  const win = loadDashboard("edit");
  const { Dashboard, document } = win;
  Dashboard.init(document.getElementById("app"));
  return Dashboard.saveToSheet().then(() => {
    const banner = document.getElementById("app").querySelector(".save-msg");
    assert.ok(banner && /게시 주소/.test(banner.textContent), "게시 주소 안내");
  });
});
