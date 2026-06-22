import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadDashboard() {
  const html = readFileSync(join(__dirname, "..", "dashboard.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://localhost/" });
  return dom.window;
}
