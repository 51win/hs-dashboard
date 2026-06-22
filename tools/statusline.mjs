#!/usr/bin/env node
// Claude Code statusLine script — token usage capture + dashboard sidecar.
//
// What it does on every statusLine tick:
//   1. Reads the JSON session payload Claude Code pipes to stdin.
//   2. Reads the session transcript (transcript_path JSONL) and sums token
//      usage across assistant messages to get cumulative session tokens.
//   3. Records/updates a per-session snapshot in a log file, keyed by session_id
//      (so re-running the same session updates rather than double-counts).
//   4. Regenerates `dashboard-tokens.js` next to dashboard.html:
//         window.DASHBOARD_TOKENS = { generatedAt, daily: [{date, tokens, cost}] }
//      daily = per-date sum across sessions of each session's latest cumulative.
//   5. Prints a short status line to stdout (token + cost), so it still works
//      as a normal status line.
//
// Target dashboard folder resolution (first hit wins):
//   - $CLAUDE_DASHBOARD_DIR
//   - the folder containing this script's parent (project root, assuming
//     tools/statusline.mjs inside the dashboard project)
//
// Limitation: statusLine has no notion of which dashboard "task" the work
// belongs to, so this auto-populates the date-wise total only. Per-task tokens
// are entered manually in the dashboard editor.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = process.env.CLAUDE_DASHBOARD_DIR || path.resolve(__dirname, "..");
const LOG_PATH = path.join(DASHBOARD_DIR, ".dashboard-token-log.json");
const SIDECAR_PATH = path.join(DASHBOARD_DIR, "dashboard-tokens.js");

function readStdin() {
  try { return fs.readFileSync(0, "utf8"); } catch { return ""; }
}

function localDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Sum input+output+cache tokens across assistant messages in a transcript JSONL.
function sumTranscriptTokens(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return 0;
  let total = 0;
  let text;
  try { text = fs.readFileSync(transcriptPath, "utf8"); } catch { return 0; }
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    let obj;
    try { obj = JSON.parse(s); } catch { continue; }
    // Usage can live at obj.message.usage (Anthropic message format).
    const usage = (obj && obj.message && obj.message.usage) || obj.usage;
    if (usage && typeof usage === "object") {
      total += (usage.input_tokens || 0)
        + (usage.output_tokens || 0)
        + (usage.cache_creation_input_tokens || 0)
        + (usage.cache_read_input_tokens || 0);
    }
  }
  return total;
}

function loadLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, "utf8")); }
  catch { return { sessions: {} }; }
}

function saveLog(log) {
  try { fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2)); } catch { /* ignore */ }
}

// Build daily totals: for each date, sum the latest cumulative tokens/cost of
// every session whose date matches.
function buildDaily(log) {
  const byDate = {};
  for (const sid of Object.keys(log.sessions)) {
    const s = log.sessions[sid];
    if (!s || !s.date) continue;
    if (!byDate[s.date]) byDate[s.date] = { date: s.date, tokens: 0, cost: 0 };
    byDate[s.date].tokens += s.tokens || 0;
    byDate[s.date].cost += s.cost || 0;
  }
  return Object.values(byDate).sort((a, b) => (a.date < b.date ? -1 : 1));
}

function writeSidecar(daily) {
  const payload = { generatedAt: new Date().toISOString(), daily };
  const js = "window.DASHBOARD_TOKENS = " + JSON.stringify(payload, null, 2) + ";\n";
  try { fs.writeFileSync(SIDECAR_PATH, js); } catch { /* ignore */ }
}

function main() {
  let data = {};
  try { data = JSON.parse(readStdin() || "{}"); } catch { data = {}; }

  const sessionId = data.session_id || "unknown";
  const cost = (data.cost && typeof data.cost.total_cost_usd === "number")
    ? data.cost.total_cost_usd : 0;
  const tokens = sumTranscriptTokens(data.transcript_path);
  const today = localDate(new Date());

  const log = loadLog();
  const prev = log.sessions[sessionId];
  log.sessions[sessionId] = {
    // keep the date this session was first seen so its tokens land on one day
    date: (prev && prev.date) || today,
    tokens,
    cost,
    updatedAt: new Date().toISOString()
  };
  saveLog(log);
  writeSidecar(buildDaily(log));

  // Short status line output.
  const model = (data.model && data.model.display_name) || "";
  const tk = tokens >= 1000 ? (tokens / 1000).toFixed(1) + "k" : String(tokens);
  process.stdout.write(`[${model}] 🪙 ${tk} tok · $${cost.toFixed(2)}`);
}

main();
