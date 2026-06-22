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
