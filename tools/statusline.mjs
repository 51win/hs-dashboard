#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = process.env.CLAUDE_DASHBOARD_DIR || path.resolve(__dirname, "..");
const LOG_PATH = path.join(DASHBOARD_DIR, ".dashboard-token-log.json");
const SIDECAR_PATH = path.join(DASHBOARD_DIR, "dashboard-tokens.js");
const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

function localDate(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function localTime(d) {
  return String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0");
}

// JSONL 한 파일에서 토큰 합산
function sumTokens(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, "utf8"); } catch { return { tokens: 0, firstTs: null }; }
  let total = 0, firstTs = null;
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    let obj;
    try { obj = JSON.parse(s); } catch { continue; }
    // 첫 번째 타임스탬프 수집
    if (!firstTs) {
      const ts = obj.timestamp || (obj.message && obj.message.created_at);
      if (ts) firstTs = ts;
    }
    const usage = (obj.message && obj.message.usage) || obj.usage;
    if (usage && typeof usage === "object") {
      total += (usage.input_tokens || 0)
        + (usage.output_tokens || 0)
        + (usage.cache_creation_input_tokens || 0)
        + (usage.cache_read_input_tokens || 0);
    }
  }
  return { tokens: total, firstTs };
}

// ~/.claude/projects/ 하위 모든 JSONL 열거
function allJsonlFiles() {
  const files = [];
  if (!fs.existsSync(PROJECTS_DIR)) return files;
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    const projDir = path.join(PROJECTS_DIR, proj);
    let entries;
    try { entries = fs.readdirSync(projDir); } catch { continue; }
    for (const f of entries) {
      if (f.endsWith(".jsonl")) {
        files.push({ sessionId: f.replace(".jsonl", ""), filePath: path.join(projDir, f) });
      }
    }
  }
  return files;
}

function loadLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, "utf8")); }
  catch { return { sessions: {} }; }
}

function saveLog(log) {
  try { fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2)); } catch {}
}

function buildDaily(log) {
  const byDate = {};
  for (const s of Object.values(log.sessions)) {
    if (!s || !s.date) continue;
    byDate[s.date] = (byDate[s.date] || 0) + (s.tokens || 0);
  }
  return Object.entries(byDate)
    .map(([date, tokens]) => ({ date, tokens }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function buildSessions(log) {
  return Object.entries(log.sessions)
    .map(([sid, s]) => ({
      sessionId: sid,
      date: s.date || "",
      time: s.time || "",
      tokens: s.tokens || 0,
      updatedAt: s.updatedAt || ""
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 100);
}

function writeSidecar(daily, sessions) {
  const payload = { generatedAt: new Date().toISOString(), daily, sessions };
  const js = "window.DASHBOARD_TOKENS = " + JSON.stringify(payload, null, 2) + ";\n";
  try { fs.writeFileSync(SIDECAR_PATH, js); } catch {}
}

function main() {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch {}

  const now = new Date();
  const activeSessionId = data.session_id || null;
  const model = (data.model && data.model.display_name) || "";

  const log = loadLog();
  const allFiles = allJsonlFiles();

  for (const { sessionId, filePath } of allFiles) {
    const isActive = sessionId === activeSessionId;
    const cached = log.sessions[sessionId];
    // 완료된 세션은 캐시 재사용 (단, 토큰이 0이면 재계산)
    if (cached && cached.tokens > 0 && !isActive) continue;

    try {
      const stat = fs.statSync(filePath);
      const { tokens, firstTs } = sumTokens(filePath);
      const sessionDate = firstTs
        ? localDate(new Date(firstTs))
        : localDate(new Date(stat.birthtimeMs || stat.mtimeMs));
      const sessionTime = firstTs
        ? localTime(new Date(firstTs))
        : localTime(new Date(stat.birthtimeMs || stat.mtimeMs));

      log.sessions[sessionId] = {
        date: (cached && cached.date) || sessionDate,
        time: (cached && cached.time) || sessionTime,
        tokens,
        updatedAt: now.toISOString()
      };
    } catch {
      continue;
    }
  }

  saveLog(log);
  const daily = buildDaily(log);
  const sessions = buildSessions(log);
  writeSidecar(daily, sessions);

  // 현재 세션 토큰 상태줄 출력
  const currentSession = activeSessionId && log.sessions[activeSessionId];
  const tk = currentSession
    ? (currentSession.tokens >= 1000
        ? (currentSession.tokens / 1000).toFixed(1) + "k"
        : String(currentSession.tokens))
    : "0";
  process.stdout.write(`[${model}] 🪙 ${tk} tok`);
}

main();
