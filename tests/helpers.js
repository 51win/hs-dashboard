import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 코어 스크립트를 모드와 함께 주입해 로드한다. 기본은 편집 모드(edit).
export function loadDashboard(mode = "edit") {
  const core = readFileSync(join(__dirname, "..", "dashboard-core.js"), "utf8");
  const html =
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>' +
    '<div id="app"></div>' +
    '<script>window.DASHBOARD_MODE=' + JSON.stringify(mode) + ";</script>" +
    "<script>" + core + "</script>" +
    "</body></html>";
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://localhost/" });
  return dom.window;
}
