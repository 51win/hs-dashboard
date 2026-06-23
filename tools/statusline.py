#!/usr/bin/env python3
"""Claude Code statusline: 토큰 합산 후 Google Sheets에 upsert하고 stdout 출력."""
import json, os, sys, urllib.request, urllib.parse, datetime

DASHBOARD_DIR = os.environ.get("CLAUDE_DASHBOARD_DIR") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_PATH = os.path.join(DASHBOARD_DIR, ".dashboard-token-log.json")
PROJECTS_DIR = os.path.join(os.path.expanduser("~"), ".claude", "projects")
WRITE_ENDPOINT = os.environ.get("DASHBOARD_WRITE_ENDPOINT") or \
    "https://script.google.com/macros/s/AKfycbyTF2rx3EwXUeuF_zExpbasSwmAHD0vbmsEhqyydQI6mug24B7_IfT8-ncW4xTe9gFGHQ/exec"

def local_date(dt): return dt.strftime("%Y-%m-%d")
def local_time(dt): return dt.strftime("%H:%M")

def sum_tokens(file_path):
    total = 0
    first_ts = None
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if not s: continue
                try: obj = json.loads(s)
                except: continue
                if first_ts is None:
                    ts = obj.get("timestamp") or (obj.get("message") or {}).get("created_at")
                    if ts: first_ts = ts
                usage = (obj.get("message") or {}).get("usage") or obj.get("usage") or {}
                if isinstance(usage, dict):
                    total += (usage.get("input_tokens") or 0) + \
                             (usage.get("output_tokens") or 0) + \
                             (usage.get("cache_creation_input_tokens") or 0) + \
                             (usage.get("cache_read_input_tokens") or 0)
    except: pass
    return total, first_ts

def all_jsonl_files():
    files = []
    if not os.path.isdir(PROJECTS_DIR): return files
    for proj in os.listdir(PROJECTS_DIR):
        proj_dir = os.path.join(PROJECTS_DIR, proj)
        if not os.path.isdir(proj_dir): continue
        try: entries = os.listdir(proj_dir)
        except: continue
        for f in entries:
            if f.endswith(".jsonl"):
                files.append((f[:-6], os.path.join(proj_dir, f)))
    return files

def load_log():
    try:
        with open(LOG_PATH) as f: return json.load(f)
    except: return {"sessions": {}}

def save_log(log):
    try:
        with open(LOG_PATH, "w") as f: json.dump(log, f, indent=2)
    except: pass

def upsert_to_sheets(session_id, date, time, tokens):
    if not WRITE_ENDPOINT: return
    payload = json.dumps({"sessionId": session_id, "date": date, "time": time, "tokens": tokens})
    url = WRITE_ENDPOINT + "?action=upsertTokenSession&payload=" + \
          urllib.parse.quote(payload) + "&callback=_dummy"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "statusline/1.0"})
        urllib.request.urlopen(req, timeout=5)
    except: pass

def main():
    data = {}
    try:
        raw = sys.stdin.read()
        if raw.strip(): data = json.loads(raw)
    except: pass

    now = datetime.datetime.now()
    active_session_id = data.get("session_id")
    model = (data.get("model") or {}).get("display_name") or ""

    log = load_log()
    all_files = all_jsonl_files()

    for session_id, file_path in all_files:
        is_active = session_id == active_session_id
        cached = log["sessions"].get(session_id)
        if cached and cached.get("tokens", 0) > 0 and not is_active:
            continue
        try:
            stat = os.stat(file_path)
            tokens, first_ts = sum_tokens(file_path)
            if first_ts:
                try: dt = datetime.datetime.fromisoformat(first_ts.replace("Z", "+00:00")).astimezone()
                except: dt = datetime.datetime.fromtimestamp(stat.st_mtime)
            else:
                dt = datetime.datetime.fromtimestamp(stat.st_mtime)
            session_date = local_date(dt)
            session_time = local_time(dt)
            log["sessions"][session_id] = {
                "date": (cached or {}).get("date") or session_date,
                "time": (cached or {}).get("time") or session_time,
                "tokens": tokens,
                "updatedAt": now.isoformat()
            }
        except: continue

    save_log(log)

    # 활성 세션 upsert (fire-and-forget via thread)
    if active_session_id and active_session_id in log["sessions"]:
        s = log["sessions"][active_session_id]
        import threading
        threading.Thread(
            target=upsert_to_sheets,
            args=(active_session_id, s["date"], s["time"], s["tokens"]),
            daemon=True
        ).start()
        import time; time.sleep(0.1)  # 최소 대기로 fire

    current = log["sessions"].get(active_session_id) if active_session_id else None
    if current:
        tk = current["tokens"]
        tk_str = f"{tk/1000:.1f}k" if tk >= 1000 else str(tk)
    else:
        tk_str = "0"
    sys.stdout.write(f"[{model}] 🪙 {tk_str} tok")

if __name__ == "__main__":
    main()
