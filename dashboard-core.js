(function (global) {
  "use strict";
  var SEED = {
    version: 1,
    groups: [
      { id: "g_team", name: "큰 과제", kind: "team_goal", order: 0 },
      { id: "g_small", name: "작은 과제", kind: "small", order: 1 },
      { id: "g_personal", name: "개인", kind: "personal", order: 2 }
    ],
    tasks: [
      { id: "t1", groupId: "g_team", name: "과제 1", status: "in_progress", owner: "한승", memo: "", checklist: [ { id: "t1c1", text: "설계 확정", note: "", done: true, importance: "high", due: "", doneAt: "" }, { id: "t1c2", text: "구현", note: "", done: false, importance: "mid", due: "", doneAt: "" } ], issues: [], tokens: [] },
      { id: "t2", groupId: "g_team", name: "과제 2", status: "todo", owner: "미정", memo: "", checklist: [], issues: [], tokens: [] },
      { id: "t3", groupId: "g_team", name: "과제 3", status: "done", owner: "지민", memo: "", checklist: [], issues: [], tokens: [] },
      { id: "t4", groupId: "g_team", name: "과제 4", status: "in_progress", owner: "한승", memo: "", checklist: [], issues: [], tokens: [] },
      { id: "t5", groupId: "g_team", name: "과제 5", status: "in_progress", owner: "수아", memo: "", checklist: [], issues: [], tokens: [] },
      { id: "t6", groupId: "g_team", name: "과제 6", status: "todo", owner: "미정", memo: "", checklist: [], issues: [], tokens: [] },
      { id: "s1", groupId: "g_small", name: "데이터 마이그레이션 CSV 정리", status: "todo", owner: "한승", memo: "", due: "", note: "", doneAt: "", checklist: [], issues: [], tokens: [] },
      { id: "s2", groupId: "g_small", name: "OAuth 클라이언트 ID 발급", status: "todo", owner: "지민", memo: "", due: "", note: "", doneAt: "", checklist: [], issues: [], tokens: [] },
      { id: "p1", groupId: "g_personal", name: "주간 진행 리포트 자동화", status: "in_progress", owner: "한승", memo: "", checklist: [], issues: [], tokens: [] }
    ]
  };

  // 사이트 모드: "view"(공유·읽기 전용) | "edit"(개인·편집). 기본 edit(테스트 호환).
  var MODE = (typeof global !== "undefined" && global.DASHBOARD_MODE) ? String(global.DASHBOARD_MODE) : "edit";
  var _readonly = false, _sheetError = "", _lastSynced = "", _tokenInterval = null, _pollingEnabled = false;
  // 시트 쓰기 엔드포인트(Apps Script 웹앱). 공개 노출을 막기 위해 로컬 edit.html에서만 주입한다.
  // (공유 index.html에는 주입하지 않으므로 배포 코드에 주소가 남지 않음.)
  var WRITE_ENDPOINT = (typeof global !== "undefined" && global.DASHBOARD_WRITE_ENDPOINT) ? String(global.DASHBOARD_WRITE_ENDPOINT) : "";
  var _saveMsg = "", _pushTimer = null;
  function canEdit() { return MODE === "edit"; }

  function defaultData() { return JSON.parse(JSON.stringify(SEED)); }
  function tasksInGroup(data, groupId) {
    return data.tasks.filter(function (t) { return t.groupId === groupId; });
  }
  function groupByKind(data, kind) {
    return data.groups.find(function (g) { return g.kind === kind; });
  }

  function statusToProgress(status) {
    if (status === "done") return 100;
    if (status === "in_progress") return 50;
    return 0;
  }
  function taskProgress(task) {
    if (task.status === "done") return 100;
    var list = task.checklist || [];
    if (list.length === 0) return statusToProgress(task.status);
    var total = 0, done = 0;
    for (var i = 0; i < list.length; i++) {
      var w = Dashboard.WEIGHTS[list[i].importance] || Dashboard.WEIGHTS.mid;
      total += w;
      if (list[i].done) done += w;
    }
    return Math.round((done / total) * 100);
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function parseDate(s) {
    var p = String(s).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function daysBetween(due, today) {
    var ms = parseDate(due).getTime() - parseDate(today).getTime();
    return Math.round(ms / 86400000);
  }
  function ddayLabel(due, today) {
    if (!due) return "";
    var diff = daysBetween(due, today);
    if (diff === 0) return "D-DAY";
    if (diff > 0) return "D-" + diff;
    return "D+" + (-diff);
  }
  function isUrgent(due, today) {
    if (due === "" || due == null) return false;
    var diff = daysBetween(due, today);
    return diff < 0 || (diff >= 0 && diff <= 2);
  }
  function endOfWeek(today) {
    // Sunday of the current week (inclusive). getDay(): 0=Sun..6=Sat.
    var d = parseDate(today);
    var dow = d.getDay();
    var add = (7 - dow) % 7; // days until Sunday
    d.setDate(d.getDate() + add);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function collectToday(data, today) {
    var dueToday = [], doneToday = [], dueThisWeek = [];
    var eow = endOfWeek(today);
    var smallGroup = groupByKind(data, "small");
    var smallId = smallGroup ? smallGroup.id : null;
    function consider(entry) {
      var item = entry.item;
      if (item.due === today && !item.done) dueToday.push(entry);
      if (item.doneAt === today) doneToday.push(entry);
      if (!item.done && item.due && item.due >= today && item.due <= eow) dueThisWeek.push(entry);
    }
    (data.tasks || []).forEach(function (t) {
      if (smallId && t.groupId === smallId) {
        // 작은 과제는 과제 자체가 체크 항목.
        consider({
          taskId: t.id,
          taskName: "작은 과제",
          item: { id: t.id, text: t.name, due: t.due || "", done: t.status === "done", doneAt: t.doneAt || "" }
        });
      } else {
        (t.checklist || []).forEach(function (item) {
          consider({ taskId: t.id, taskName: t.name, item: item });
        });
      }
    });
    return { dueToday: dueToday, doneToday: doneToday, dueThisWeek: dueThisWeek };
  }
  function taskTokenTotal(task) {
    return (task.tokens || []).reduce(function (sum, e) { return sum + (Number(e.tokens) || 0); }, 0);
  }
  function dailyTokenSeries() {
    var dt = global.DASHBOARD_TOKENS;
    if (!dt || !Array.isArray(dt.daily)) return [];
    return dt.daily.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
  }

  // 토큰 메모: sidecar(자동 생성)와 별개로 localStorage에 저장해 statusline 재생성 시에도 유지.
  var TOKEN_MEMOS_KEY = "dashboard-token-memos";
  function loadTokenMemos() {
    try { return JSON.parse(global.localStorage.getItem(TOKEN_MEMOS_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveTokenMemo(date, memo) {
    var memos = loadTokenMemos();
    if (memo) memos[date] = memo; else delete memos[date];
    global.localStorage.setItem(TOKEN_MEMOS_KEY, JSON.stringify(memos));
  }
  // sidecar daily에 localStorage 메모를 병합. localStorage 우선.
  function mergedDailySeries() {
    var series = dailyTokenSeries();
    var memos = loadTokenMemos();
    return series.map(function (d) {
      return { date: d.date, tokens: d.tokens, cost: d.cost,
        memo: memos[d.date] !== undefined ? memos[d.date] : (d.memo || "") };
    });
  }
  function dailyListHtml(series) {
    if (!series.length) return '<div class="empty">아직 기록된 토큰이 없습니다.</div>';
    var rows = series.slice().reverse().map(function (d) {
      var tk = d.tokens >= 1000 ? (d.tokens / 1000).toFixed(1) + "k" : String(d.tokens || 0);
      var cost = typeof d.cost === "number" && d.cost > 0 ? " · $" + d.cost.toFixed(2) : "";
      var memo = canEdit()
        ? '<input class="tok-day-memo" data-date="' + esc(d.date) + '" value="' + esc(d.memo) +
          '" placeholder="어떤 과제 작업했는지 메모">'
        : (d.memo ? '<span class="tok-day-memo-ro">' + esc(d.memo) + "</span>" : "");
      return '<div class="tok-day-row">' +
        '<span class="tok-day-date">' + esc(d.date) + "</span>" +
        '<span class="tok-day-count">' + tk + esc(cost) + "</span>" +
        memo + "</div>";
    }).join("");
    return '<div class="tok-daily-list">' + rows + "</div>";
  }

  var STORAGE_KEY = "dashboard-data";
  function saveData(data) {
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  function loadData() {
    var raw = global.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    try { return importData(raw); } catch (e) { return defaultData(); }
  }
  function exportData(data) { return JSON.stringify(data, null, 2); }
  function importData(jsonString) {
    var obj = JSON.parse(jsonString);
    if (!obj || !Array.isArray(obj.groups) || !Array.isArray(obj.tasks)) {
      throw new Error("invalid data: groups/tasks required");
    }
    return obj;
  }

  // ---- Google Sheets (read-only) data source ----
  var SHEET_ID_KEY = "dashboard-sheet-id";
  // 배포(공개 뷰어) 기본 시트. localStorage에 직접 지정한 값이 있으면 그게 우선.
  var DEFAULT_SHEET_ID = "1yYy_uxc7C-fLaIfVTl88dGKxSDgvWn3emEgxNKF7otY";
  var _loadedSheetId = "";
  function effectiveSheetId() { return getSheetId() || DEFAULT_SHEET_ID; }
  function sheetCsvUrl(sheetId, tab) {
    return "https://docs.google.com/spreadsheets/d/" + sheetId +
      "/gviz/tq?tqx=out%3Acsv&sheet=" + encodeURIComponent(tab);
  }
  function parseCsv(text) {
    var s = String(text == null ? "" : text);
    if (s === "") return [];
    var rows = [], row = [], field = "", i = 0, inQuotes = false;
    var n = s.length;
    while (i < n) {
      var ch = s[i];
      if (inQuotes) {
        if (ch === '"') {
          if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ",") { row.push(field); field = ""; i++; continue; }
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += ch; i++;
    }
    row.push(field);
    rows.push(row);
    // ignore a single trailing empty line (one row with one empty cell)
    if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
      rows.pop();
    }
    return rows;
  }
  function csvToObjects(text) {
    var rows = parseCsv(text);
    if (!rows.length) return [];
    var header = rows[0].map(function (h) { return String(h).trim(); });
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var obj = {};
      for (var c = 0; c < header.length; c++) {
        obj[header[c]] = rows[r][c] != null ? rows[r][c] : "";
      }
      out.push(obj);
    }
    return out;
  }
  function truthyCsv(v) {
    var s = String(v == null ? "" : v).trim().toLowerCase();
    return s === "true" || s === "1" || s === "y" || s === "yes" || s === "o";
  }
  function SHEET_GROUPS() {
    return [
      { id: "g_team", name: "큰 과제", kind: "team_goal", order: 0 },
      { id: "g_small", name: "작은 과제", kind: "small", order: 1 },
      { id: "g_personal", name: "개인", kind: "personal", order: 2 }
    ];
  }
  function groupToGroupId(group) {
    if (group === "small") return "g_small";
    if (group === "personal") return "g_personal";
    if (group === "team_goal") return "g_team";
    return "g_team";
  }
  function parseSheetData(tasksCsv, checklistCsv) {
    var taskObjs = csvToObjects(tasksCsv);
    var clObjs = csvToObjects(checklistCsv);
    var tasks = taskObjs.map(function (o) {
      return {
        id: String(o.id || ""),
        groupId: groupToGroupId(String(o.group || "")),
        name: String(o.name || ""),
        status: o.status ? String(o.status) : "todo",
        owner: String(o.owner || ""),
        due: String(o.due || ""),
        doneAt: String(o.doneAt || ""),
        memo: String(o.memo || ""),
        note: "",
        checklist: [],
        issues: [],
        tokens: []
      };
    });
    var byId = {};
    tasks.forEach(function (t) { byId[t.id] = t; });
    clObjs.forEach(function (o) {
      var t = byId[String(o.taskId || "")];
      if (!t) return;
      t.checklist.push({
        id: String(o.id || ""),
        text: String(o.text || ""),
        note: String(o.note || ""),
        importance: o.importance ? String(o.importance) : "mid",
        done: truthyCsv(o.done),
        due: String(o.due || ""),
        doneAt: String(o.doneAt || "")
      });
    });
    return { version: 1, groups: SHEET_GROUPS(), tasks: tasks };
  }
  function getSheetId() {
    return global.localStorage.getItem(SHEET_ID_KEY) || "";
  }
  function setSheetId(id) {
    global.localStorage.setItem(SHEET_ID_KEY, String(id));
  }
  function clearSheetId() {
    global.localStorage.removeItem(SHEET_ID_KEY);
  }
  function applySheetData(parsed) {
    _state = parsed;
    _readonly = true;
    rerender();
    return _state;
  }
  function nowTimeStr() {
    var d = new Date();
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }
  function loadFromSheet(sheetId) {
    // WRITE_ENDPOINT가 있으면 JSONP(Apps Script)로 읽기 — CORS 우회
    if (WRITE_ENDPOINT && typeof document !== "undefined" && document.head) {
      return new Promise(function (resolve) {
        var cb = "__dashRead" + Date.now() + Math.floor(Math.random() * 1000);
        var s = null, done = false;
        function cleanup() {
          try { delete global[cb]; } catch (e) { global[cb] = undefined; }
          if (s && s.parentNode) s.parentNode.removeChild(s);
        }
        var timer = setTimeout(function () {
          if (done) return; done = true; cleanup();
          _sheetError = "시트를 불러오지 못했어요. 잠시 후 다시 시도하세요.";
          _readonly = false; _state = loadData(); rerender(); resolve(null);
        }, 15000);
        if (timer && typeof timer.unref === "function") timer.unref();
        global[cb] = function (res) {
          if (done) return; done = true; clearTimeout(timer); cleanup();
          if (res && res.ok) {
            var tRows = res.tasks || [], cRows = res.checklist || [];
            // Apps Script returns array-of-arrays; convert to CSV-like strings for parseSheetData
            var tCsv = tRows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
            var cCsv = cRows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
            var parsed = parseSheetData(tCsv, cCsv);
            _sheetError = ""; _lastSynced = nowTimeStr(); _loadedSheetId = sheetId;
            applySheetData(parsed);
          } else {
            _sheetError = "시트를 불러오지 못했어요: " + (res && res.error ? res.error : "알 수 없는 오류");
            _readonly = false; _state = loadData(); rerender();
          }
          resolve(_state);
        };
        s = document.createElement("script");
        s.src = WRITE_ENDPOINT + "?action=read&callback=" + encodeURIComponent(cb);
        s.onerror = function () {
          if (done) return; done = true; clearTimeout(timer); cleanup();
          _sheetError = "시트를 불러오지 못했어요. 잠시 후 다시 시도하세요.";
          _readonly = false; _state = loadData(); rerender(); resolve(null);
        };
        document.head.appendChild(s);
      });
    }
    // fallback: fetch(gviz CSV)
    if (typeof fetch !== "function") {
      _sheetError = "이 환경에서는 시트를 불러올 수 없어요.";
      _readonly = false; rerender();
      return Promise.resolve(null);
    }
    return Promise.all([
      fetch(sheetCsvUrl(sheetId, "Tasks")).then(function (r) { return r.text(); }),
      fetch(sheetCsvUrl(sheetId, "Checklist")).then(function (r) { return r.text(); })
    ]).then(function (texts) {
      var parsed = parseSheetData(texts[0], texts[1]);
      _sheetError = ""; _lastSynced = nowTimeStr(); _loadedSheetId = sheetId;
      applySheetData(parsed);
      return _state;
    }).catch(function () {
      _sheetError = "시트를 불러오지 못했어요. 잠시 후 다시 시도하세요.";
      _readonly = false; _state = loadData(); rerender();
      return null;
    });
  }

  function dataToSheetRows(data) {
    var kindOf = {};
    (data.groups || []).forEach(function (g) { kindOf[g.id] = g.kind; });
    var tasks = (data.tasks || []).map(function (t) {
      return { id: t.id, group: kindOf[t.groupId] || "team_goal", name: t.name || "",
        status: t.status || "todo", owner: t.owner || "", due: t.due || "",
        doneAt: t.doneAt || "", memo: t.memo || "" };
    });
    var checklist = [];
    (data.tasks || []).forEach(function (t) {
      (t.checklist || []).forEach(function (c) {
        checklist.push({ taskId: t.id, id: c.id, text: c.text || "", note: c.note || "",
          importance: c.importance || "mid", done: c.done ? "TRUE" : "FALSE",
          due: c.due || "", doneAt: c.doneAt || "" });
      });
    });
    return { tasks: tasks, checklist: checklist };
  }
  // 편집 사이트에서 변경 발생 시 디바운스로 자동 게시(올리기). file://에서도 JSONP로 동작.
  function schedulePush() {
    if (MODE !== "edit") return;
    if (typeof setTimeout !== "function") return;
    if (_pushTimer) { try { clearTimeout(_pushTimer); } catch (e) {} }
    _pushTimer = setTimeout(function () { _pushTimer = null; saveToSheet(); }, 2500);
    if (_pushTimer && typeof _pushTimer.unref === "function") _pushTimer.unref();
  }
  // JSONP로 Apps Script doGet을 호출 → CORS 우회 + 서버 응답을 직접 읽어 정확한 피드백.
  function saveToSheet() {
    if (!WRITE_ENDPOINT) { _saveMsg = "게시 주소가 설정되지 않았어요(edit.html의 DASHBOARD_WRITE_ENDPOINT 확인)."; rerender(); return Promise.resolve(); }
    var payload = dataToSheetRows(_state);
    var data = { tasks: payload.tasks, checklist: payload.checklist };
    _saveMsg = "게시 중…"; rerender();
    if (typeof document === "undefined" || !document.head) {
      _saveMsg = "이 환경에서는 게시할 수 없어요."; rerender();
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      var cb = "__dashSave" + Date.now() + Math.floor(Math.random() * 1000);
      var s = null, done = false;
      function cleanup() {
        try { delete global[cb]; } catch (e) { global[cb] = undefined; }
        if (s && s.parentNode) s.parentNode.removeChild(s);
      }
      var timer = setTimeout(function () {
        if (done) return; done = true; cleanup();
        _saveMsg = "게시 응답이 없어요. 웹앱을 새 버전으로 배포했는지 확인하세요.";
        rerender(); resolve();
      }, 15000);
      if (timer && typeof timer.unref === "function") timer.unref();
      global[cb] = function (res) {
        if (done) return; done = true; clearTimeout(timer); cleanup();
        if (res && res.ok) {
          _saveMsg = "시트에 게시됨 ✓ " + nowTimeStr();
          rerender();
        } else {
          var err = res && res.error ? res.error : "알 수 없는 오류";
          _saveMsg = "게시 실패: " + err;
          rerender();
        }
        resolve();
      };
      var url = WRITE_ENDPOINT + "?callback=" + encodeURIComponent(cb) +
        "&payload=" + encodeURIComponent(JSON.stringify(data));
      s = document.createElement("script");
      s.src = url;
      s.onerror = function () {
        if (done) return; done = true; clearTimeout(timer); cleanup();
        _saveMsg = "게시 요청 실패(네트워크/배포 확인).";
        rerender(); resolve();
      };
      document.head.appendChild(s);
    });
  }

  // 보조: 시트에서 현재 데이터를 끌어와 작업본을 갱신(내려받기). http에서 동작, file://에서는 불가.
  function pullFromSheet() {
    if (typeof fetch !== "function") {
      _saveMsg = "불러오기는 파일(file://)에서는 불가해요. 평소엔 이 파일에서만 편집하면 됩니다.";
      rerender(); return Promise.resolve(null);
    }
    var sid = effectiveSheetId();
    _saveMsg = "불러오는 중…"; rerender();
    return Promise.all([
      fetch(sheetCsvUrl(sid, "Tasks")).then(function (r) { return r.text(); }),
      fetch(sheetCsvUrl(sid, "Checklist")).then(function (r) { return r.text(); })
    ]).then(function (texts) {
      _state = parseSheetData(texts[0], texts[1]);
      persistRaw();
      _saveMsg = "시트에서 불러옴 ✓ " + nowTimeStr();
      rerender();
      return _state;
    }).catch(function () {
      _saveMsg = "불러오기 실패(네트워크/공개 설정 확인).";
      rerender(); return null;
    });
  }

  function statusLabel(s) { return s === "done" ? "완료" : s === "in_progress" ? "진행" : "예정"; }
  function importanceLabel(i) { return i === "high" ? "상" : i === "low" ? "하" : "중"; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function metaHtml(task) {
    return '<span class="badge" data-status="' + task.status + '">' + statusLabel(task.status) + "</span>" +
      '<span class="owner">' + esc(task.owner || "미정") + "</span>";
  }
  function barHtml(task) {
    var p = taskProgress(task);
    return '<div class="bar"><i style="width:' + p + '%"></i></div><span class="pct">' + p + "%</span>";
  }

  function editorHtml(t) {
    var rows = (t.checklist || []).map(function (c) {
      return '<div class="cl-item" data-item-id="' + c.id + '">' +
        '<input type="checkbox" class="cl-done" data-item-id="' + c.id + '"' + (c.done ? " checked" : "") + ">" +
        '<input class="cl-text" data-item-id="' + c.id + '" value="' + esc(c.text) + '">' +
        '<select class="cl-imp" data-item-id="' + c.id + '">' +
        ['high','mid','low'].map(function (v) {
          return '<option value="' + v + '"' + (c.importance === v ? " selected" : "") + ">" + importanceLabel(v) + "</option>";
        }).join("") + "</select>" +
        '<input class="cl-note" data-item-id="' + c.id + '" placeholder="설명" value="' + esc(c.note || "") + '">' +
        '<input class="cl-due" type="date" data-item-id="' + c.id + '" value="' + esc(c.due || "") + '">' +
        '<button class="cl-del" type="button" data-item-id="' + c.id + '" aria-label="항목 삭제">삭제</button>' +
        "</div>";
    }).join("");
    var tokRows = (t.tokens || []).map(function (e) {
      return '<li class="tok-row">' + esc(e.date) + " · " + (Number(e.tokens) || 0) + " tok" +
        (e.estimated ? " (예상)" : "") + "</li>";
    }).join("");
    return '<div class="editor" data-task-id="' + t.id + '" hidden>' +
      '<label class="fld"><span class="fld-label">이름</span>' +
        '<input class="name-input" value="' + esc(t.name) + '"></label>' +
      '<div class="fld-row">' +
        '<label class="fld"><span class="fld-label">상태</span><select class="status">' +
          ['todo','in_progress','done'].map(function (v) {
            return '<option value="' + v + '"' + (t.status === v ? " selected" : "") + ">" + statusLabel(v) + "</option>";
          }).join("") + "</select></label>" +
        '<label class="fld"><span class="fld-label">담당</span>' +
          '<input class="owner-input" value="' + esc(t.owner) + '"></label>' +
      "</div>" +
      '<div class="fld"><span class="fld-label">체크리스트</span>' +
        '<div class="checklist">' + rows + "</div>" +
        '<button class="cl-add" type="button">+ 항목 추가</button></div>' +
      '<label class="fld"><span class="fld-label">메모</span>' +
        '<textarea class="memo">' + esc(t.memo) + "</textarea></label>" +
      '<div class="fld"><span class="fld-label">토큰 기록</span>' +
      '<div class="tok-edit"><div class="tok-fields">' +
        '<input class="tok-date" type="date" aria-label="토큰 날짜">' +
        '<input class="tok-num" type="number" min="0" placeholder="토큰수" aria-label="토큰수">' +
        '<label class="tok-est"><input type="checkbox" class="tok-estimated"> 예상</label>' +
        '<button class="tok-add" type="button">추가</button>' +
      '</div><ul class="tok-list">' + tokRows + '</ul></div></div>' +
      '<div class="editor-actions"><button class="save-btn" type="button">저장</button></div>' +
      "</div>";
  }

  function tabBarHtml() {
    var tabs = [["board","대시보드"],["tokens","토큰"]];
    return '<div class="tabs" role="tablist">' + tabs.map(function (p) {
      return '<button class="tab" role="tab" data-tab="' + p[0] + '"' +
        (_tab === p[0] ? ' aria-selected="true"' : ' aria-selected="false"') + ">" + p[1] + "</button>";
    }).join("") + "</div>";
  }

  function smallHtml(data, group) {
    var today = todayStr();
    var html = '<h2>' + esc(group.name) + '</h2><div class="small-list">';
    tasksInGroup(data, group.id).forEach(function (t) {
      var due = t.due || "";
      var label = ddayLabel(due, today);
      var badge = label ? '<span class="dday' + (isUrgent(due, today) ? " urgent" : "") + '">' + label + "</span>" : "";
      var doneCls = t.status === "done" ? " done" : "";
      if (!canEdit()) {
        html += '<div class="small-row" data-task-id="' + t.id + '">' +
          '<input type="checkbox" class="sm-done"' + (t.status === "done" ? " checked" : "") + ' disabled aria-label="완료">' +
          '<span class="sm-name-ro' + doneCls + '">' + esc(t.name) + "</span>" +
          (due ? '<span class="sm-due-ro">' + esc(due) + "</span>" : "") +
          badge +
          "</div>";
      } else {
        html += '<div class="small-row" data-task-id="' + t.id + '">' +
          '<input type="checkbox" class="sm-done"' + (t.status === "done" ? " checked" : "") + ' aria-label="완료">' +
          '<input class="sm-name' + doneCls + '" value="' + esc(t.name) + '" aria-label="작은 과제 이름">' +
          '<input class="sm-due" type="date" value="' + esc(due) + '" aria-label="기한">' +
          badge +
          '<button class="sm-del" type="button" aria-label="삭제">삭제</button>' +
          "</div>";
      }
    });
    if (canEdit()) html += '<button class="sm-add" type="button">+ 작은 과제 추가</button>';
    html += '</div>';
    return html;
  }

  function boardHtml(data) {
    var team = groupByKind(data, "team_goal");
    var small = groupByKind(data, "small");
    var personal = groupByKind(data, "personal");
    // 랜딩 상단: 오늘 해야 할 것.
    var html = '<section class="today-panel" aria-label="오늘">' + todayHtml(data) + '</section>';
    var teamCount = tasksInGroup(data, team.id).length;
    html += "<h2>" + esc(team.name) + " (" + teamCount + ")</h2><div class=\"grid6\">";
    tasksInGroup(data, team.id).forEach(function (t) {
      if (!canEdit()) {
        html += '<div class="card" data-task-id="' + t.id + '"><div class="t-name">' + esc(t.name) +
          '</div><div class="meta">' + metaHtml(t) + "</div>" + barHtml(t) + "</div>";
      } else {
        html += '<div class="card" tabindex="0" data-task-id="' + t.id + '"><div class="t-name">' + esc(t.name) +
          '</div><div class="meta">' + metaHtml(t) + "</div>" + barHtml(t) + editorHtml(t) + "</div>";
      }
    });
    html += "</div>";
    if (small) html += smallHtml(data, small);
    if (personal) {
      html += "<h2>" + esc(personal.name) + "</h2>";
      tasksInGroup(data, personal.id).forEach(function (t) {
        if (!canEdit()) {
          html += '<div class="row" data-task-id="' + t.id + '">' + metaHtml(t) +
            '<span class="r-name">' + esc(t.name) + "</span>" + barHtml(t) + "</div>";
        } else {
          html += '<div class="row" tabindex="0" data-task-id="' + t.id + '">' + metaHtml(t) +
            '<span class="r-name">' + esc(t.name) + "</span>" + barHtml(t) + editorHtml(t) + "</div>";
        }
      });
    }
    return html;
  }

  function todayRowHtml(entry, today) {
    var due = entry.item.due || "";
    var label = ddayLabel(due, today);
    var badge = label ? '<span class="dday' + (isUrgent(due, today) ? " urgent" : "") + '">' + label + "</span>" : "";
    return '<div class="today-row"><span class="t-task">' + esc(entry.taskName) + "</span>" +
      '<span class="t-item">' + esc(entry.item.text) + "</span>" + badge + "</div>";
  }

  function todaySection(title, list, today, emptyMsg) {
    var count = list.length ? ' <span class="count">' + list.length + "</span>" : "";
    var body = list.length
      ? list.map(function (e) { return todayRowHtml(e, today); }).join("")
      : '<div class="empty">' + emptyMsg + "</div>";
    return '<h3 class="today-h">' + title + count + "</h3><div class=\"today-list\">" + body + "</div>";
  }

  function todayHtml(data) {
    var today = todayStr();
    var c = collectToday(data, today);
    return '<h2 class="today-lead">오늘</h2>' +
      todaySection("오늘 할 일", c.dueToday, today, "오늘 마감인 항목이 없어요.") +
      todaySection("오늘 완료", c.doneToday, today, "아직 오늘 완료한 항목이 없어요.") +
      todaySection("이번 주 기한", c.dueThisWeek, today, "이번 주 마감 항목이 없어요.");
  }

  function trendChartSvg(series) {
    if (!series.length) return '<div class="empty">토큰 추이 데이터가 없습니다.</div>';
    var W = 600, H = 200, padL = 44, padB = 28, padT = 12, padR = 12;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var max = series.reduce(function (m, d) { return Math.max(m, Number(d.tokens) || 0); }, 0) || 1;
    var n = series.length;
    var bw = plotW / n;
    var bars = series.map(function (d, i) {
      var v = Number(d.tokens) || 0;
      var h = Math.round((v / max) * plotH);
      var x = padL + i * bw + bw * 0.15;
      var y = padT + (plotH - h);
      var lbl = n <= 12 ? '<text x="' + (x + bw * 0.35) + '" y="' + (H - padB + 14) + '" class="ax" text-anchor="middle">' + esc(d.date.slice(5)) + "</text>" : "";
      return '<rect x="' + x + '" y="' + y + '" width="' + (bw * 0.7) + '" height="' + h +
        '" rx="2" fill="var(--primary)"></rect>' + lbl;
    }).join("");
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="전체 토큰 추이">' +
      '<text x="' + padL + '" y="' + (padT + 4) + '" class="ax" text-anchor="end" dx="-4">' + max + "</text>" +
      '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '" stroke="var(--border)"></line>' +
      bars + "</svg>";
  }

  function compareChartSvg(data) {
    var items = (data.tasks || []).map(function (t) {
      return { name: t.name, total: taskTokenTotal(t) };
    }).filter(function (x) { return x.total > 0; });
    if (!items.length) return '<div class="empty">과제별 토큰 데이터가 없습니다.</div>';
    var max = items.reduce(function (m, x) { return Math.max(m, x.total); }, 0) || 1;
    var rowH = 26, padL = 4, labelW = 160, valW = 50, gap = 8;
    var W = 600, barAreaW = W - labelW - valW - gap * 2 - padL;
    var H = items.length * rowH + 8;
    var rows = items.map(function (x, i) {
      var y = i * rowH + 4;
      var w = Math.max(2, Math.round((x.total / max) * barAreaW));
      return '<text x="' + padL + '" y="' + (y + 15) + '" class="ax-lbl">' + esc(x.name) + "</text>" +
        '<rect x="' + (padL + labelW + gap) + '" y="' + (y + 5) + '" width="' + w + '" height="14" rx="2" fill="var(--primary-weak)"></rect>' +
        '<text x="' + (padL + labelW + gap + w + 6) + '" y="' + (y + 16) + '" class="ax">' + x.total + "</text>";
    }).join("");
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="과제별 토큰 비교">' + rows + "</svg>";
  }

  function tokensHtml(data) {
    var series = mergedDailySeries();
    return '<button class="token-refresh" type="button">새로고침</button>' +
      "<h2>전체 추이</h2>" + trendChartSvg(series) +
      "<h2>일별 기록</h2>" + dailyListHtml(series) +
      "<h2>과제별 비교</h2>" + compareChartSvg(data);
  }

  function reloadTokensSidecar(onDone) {
    if (typeof document === "undefined" || !document.createElement || !document.head) {
      if (onDone) onDone();
      return;
    }
    var s = document.createElement("script");
    s.src = "dashboard-tokens.js?t=" + Date.now();
    s.onload = function () { if (onDone) onDone(); };
    s.onerror = function () { if (onDone) onDone(); };
    document.head.appendChild(s);
  }
  function refreshTokensTab() {
    reloadTokensSidecar(function () {
      if (_tab === "tokens") rerender();
    });
  }
  function setupTokenPolling() {
    if (typeof setInterval !== "function") return;
    if (_tab === "tokens" && _pollingEnabled) {
      if (_tokenInterval == null) {
        _tokenInterval = setInterval(function () {
          if (_tab !== "tokens") return;
          reloadTokensSidecar(function () { if (_tab === "tokens") rerender(); });
        }, 30000);
        if (_tokenInterval && typeof _tokenInterval.unref === "function") _tokenInterval.unref();
      }
    } else if (_tokenInterval != null && typeof clearInterval === "function") {
      clearInterval(_tokenInterval);
      _tokenInterval = null;
    }
  }
  function truncateId(id) {
    var s = String(id || "");
    return s.length > 12 ? s.slice(0, 9) + "…" : s;
  }
  // 공유(열람) 사이트 배너: 읽기 전용 + 새로고침만.
  function viewBannerHtml() {
    if (_sheetError) {
      return '<div class="sheet-banner error"><span class="sheet-banner-text">' + esc(_sheetError) + "</span>" +
        '<span class="sheet-actions"><button class="sheet-refresh" type="button">새로고침</button></span></div>';
    }
    var sync = _lastSynced ? '<span class="sheet-banner-sync">마지막 동기화 ' + esc(_lastSynced) + "</span>" : "";
    return '<div class="sheet-banner">' +
      '<span class="sheet-banner-text">공개 구글 시트에서 읽는 중</span>' +
      '<span class="sheet-banner-id">' + esc(truncateId(_loadedSheetId || effectiveSheetId())) + "</span>" +
      sync +
      '<span class="sheet-actions"><button class="sheet-refresh" type="button">새로고침</button></span>' +
      "</div>";
  }
  // 편집(개인) 사이트 배너: 게시 상태.
  function editBannerHtml() {
    var msg = _saveMsg ? '<span class="save-msg">' + esc(_saveMsg) + "</span>" : "";
    return '<div class="sheet-banner admin">' +
      '<span class="sheet-banner-text">로컬 편집 중</span>' +
      msg +
      '<span class="sheet-actions">' +
      '<button class="admin-save" type="button">지금 게시</button>' +
      "</span></div>";
  }
  function localActionsHtml() { return ""; }
  function render(data, rootEl) {
    var isView = MODE === "view";
    var actions = (isView || _tab === "tokens") ? "" : localActionsHtml();
    var header = '<div class="appbar">' + tabBarHtml() + actions + "</div>";
    var banner = "";
    if (_tab !== "tokens") {
      banner = isView ? viewBannerHtml() : editBannerHtml();
    }
    var body = _tab === "tokens" ? tokensHtml(data) : boardHtml(data);
    rootEl.innerHTML = header + banner + body;
    setupTokenPolling();
  }

  function findTask(data, taskId) { return data.tasks.find(function (t) { return t.id === taskId; }); }
  function toggleChecklistItem(data, taskId, itemId) {
    var t = findTask(data, taskId); if (!t) return data;
    var it = t.checklist.find(function (c) { return c.id === itemId; });
    if (it) {
      it.done = !it.done;
      it.doneAt = it.done ? todayStr() : "";
    }
    return data;
  }
  function setTaskName(data, taskId, name) {
    var t = findTask(data, taskId); if (t) t.name = name;
    return data;
  }
  function addChecklistItem(data, taskId) {
    var t = findTask(data, taskId); if (!t) return null;
    if (!t.checklist) t.checklist = [];
    var id = taskId + "c" + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
    t.checklist.push({ id: id, text: "새 항목", note: "", done: false, importance: "mid", due: "", doneAt: "" });
    return id;
  }
  function removeChecklistItem(data, taskId, itemId) {
    var t = findTask(data, taskId); if (!t) return data;
    t.checklist = (t.checklist || []).filter(function (c) { return c.id !== itemId; });
    return data;
  }
  function setChecklistNote(data, taskId, itemId, note) {
    var t = findTask(data, taskId); if (!t) return data;
    var it = t.checklist.find(function (c) { return c.id === itemId; });
    if (it) it.note = note;
    return data;
  }
  function setChecklistDue(data, taskId, itemId, due) {
    var t = findTask(data, taskId); if (!t) return data;
    var it = t.checklist.find(function (c) { return c.id === itemId; });
    if (it) it.due = due;
    return data;
  }
  function setChecklistText(data, taskId, itemId, text) {
    var t = findTask(data, taskId); if (!t) return data;
    var it = t.checklist.find(function (c) { return c.id === itemId; });
    if (it) it.text = text;
    return data;
  }
  function setChecklistImportance(data, taskId, itemId, importance) {
    var t = findTask(data, taskId); if (!t) return data;
    var it = t.checklist.find(function (c) { return c.id === itemId; });
    if (it) it.importance = importance;
    return data;
  }
  function setTaskStatus(data, taskId, status) {
    var t = findTask(data, taskId); if (t) t.status = status;
    return data;
  }
  function setTaskDue(data, taskId, due) {
    var t = findTask(data, taskId); if (t) t.due = due;
    return data;
  }
  function toggleSmallDone(data, taskId) {
    var t = findTask(data, taskId); if (!t) return data;
    t.status = t.status === "done" ? "todo" : "done";
    t.doneAt = t.status === "done" ? todayStr() : "";
    return data;
  }
  function addSmallTask(data) {
    var g = groupByKind(data, "small"); if (!g) return null;
    var id = "s" + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
    data.tasks.push({ id: id, groupId: g.id, name: "새 과제", status: "todo", owner: "",
      memo: "", due: "", note: "", doneAt: "", checklist: [], issues: [], tokens: [] });
    return id;
  }
  function removeTask(data, taskId) {
    data.tasks = (data.tasks || []).filter(function (t) { return t.id !== taskId; });
    return data;
  }

  var _state = null, _root = null, _bound = false, _tab = "board";
  function rerender() { render(_state, _root); }
  function setTab(tab) { _tab = tab; rerender(); }
  function openEditor(taskId) {
    var ed = _root.querySelector('.editor[data-task-id="' + taskId + '"]');
    if (ed) ed.hidden = !ed.hidden;
  }
  function persistRaw() { saveData(_state); }
  // 자동 게시는 끔(실수로 시트를 덮어쓰는 사고 방지). 게시는 "지금 게시" 버튼으로만.
  function persist() { saveData(_state); }
  function closestTaskId(el) {
    var n = el.closest("[data-task-id]");
    return n ? n.getAttribute("data-task-id") : null;
  }
  function applyImportedJson(jsonString) {
    _state = importData(jsonString);
    persist();
    rerender();
    return _state;
  }
  function init(rootEl) {
    _root = rootEl;
    // view: 시트가 진실. edit: 로컬 작업본이 진실(시트로 게시).
    _state = (MODE === "view") ? defaultData() : loadData();
    render(_state, _root);
    try {
      var isJsdom = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent || "");
      var sid = effectiveSheetId();
      if (MODE === "view" && sid && typeof fetch === "function" && !isJsdom) { loadFromSheet(sid); }
    } catch (e) { /* never throw on init */ }
    if (_bound) return;
    _bound = true;
    rootEl.addEventListener("click", function (e) {
      if (e.target.classList && e.target.classList.contains("tab")) {
        var tab = e.target.getAttribute("data-tab");
        if (tab === "tokens") _pollingEnabled = true;
        setTab(tab);
        return;
      }
      if (e.target.classList && e.target.classList.contains("token-refresh")) {
        _pollingEnabled = true;
        refreshTokensTab();
        setupTokenPolling();
        return;
      }
      if (e.target.classList && e.target.classList.contains("sheet-refresh")) {
        loadFromSheet(effectiveSheetId());
        return;
      }
      if (e.target.classList && e.target.classList.contains("admin-save")) {
        if (_pushTimer) { try { clearTimeout(_pushTimer); } catch (er) {} _pushTimer = null; }
        saveToSheet();
        return;
      }
      if (e.target.closest(".editor")) {
        var taskId = closestTaskId(e.target);
        if (e.target.classList.contains("save-btn")) {
          persist(); rerender(); /* 저장 후 해당 편집 칸을 닫음(기본 hidden 유지) */
        } else if (e.target.classList.contains("cl-del")) {
          removeChecklistItem(_state, taskId, e.target.getAttribute("data-item-id"));
          persist(); rerender(); openEditor(taskId);
        } else if (e.target.classList.contains("cl-add")) {
          addChecklistItem(_state, taskId);
          persist(); rerender(); openEditor(taskId);
        } else if (e.target.classList.contains("tok-add")) {
          var ed = e.target.closest(".editor");
          var dateEl = ed.querySelector(".tok-date");
          var numEl = ed.querySelector(".tok-num");
          var estEl = ed.querySelector(".tok-estimated");
          var t = findTask(_state, taskId);
          if (t && numEl.value !== "") {
            if (!t.tokens) t.tokens = [];
            t.tokens.push({ date: dateEl.value || todayStr(), tokens: Number(numEl.value) || 0, estimated: !!(estEl && estEl.checked), note: "" });
            persist(); rerender(); openEditor(taskId);
          }
        }
        return;
      }
      if (e.target.classList.contains("sm-add")) {
        addSmallTask(_state); persist(); rerender(); return;
      }
      if (e.target.classList.contains("sm-del")) {
        removeTask(_state, closestTaskId(e.target)); persist(); rerender(); return;
      }
      var card = e.target.closest(".card, .row");
      if (card) openEditor(card.getAttribute("data-task-id"));
    });
    rootEl.addEventListener("change", function (e) {
      var taskId = closestTaskId(e.target);
      if (!taskId) return;
      if (e.target.classList.contains("sm-done")) { toggleSmallDone(_state, taskId); persist(); rerender(); return; }
      if (e.target.classList.contains("sm-due")) { setTaskDue(_state, taskId, e.target.value); persist(); rerender(); return; }
      if (e.target.classList.contains("status")) setTaskStatus(_state, taskId, e.target.value);
      else if (e.target.classList.contains("cl-done")) toggleChecklistItem(_state, taskId, e.target.getAttribute("data-item-id"));
      else if (e.target.classList.contains("cl-imp")) setChecklistImportance(_state, taskId, e.target.getAttribute("data-item-id"), e.target.value);
      else if (e.target.classList.contains("cl-due")) setChecklistDue(_state, taskId, e.target.getAttribute("data-item-id"), e.target.value);
      else return;
      persist(); rerender(); openEditor(taskId);
    });
    rootEl.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var card = e.target.closest(".card, .row");
      if (!card || e.target !== card) return;
      e.preventDefault();
      openEditor(card.getAttribute("data-task-id"));
    });
    rootEl.addEventListener("input", function (e) {
      if (e.target.classList.contains("tok-day-memo")) {
        saveTokenMemo(e.target.getAttribute("data-date"), e.target.value);
        return;
      }
      var taskId = closestTaskId(e.target);
      if (!taskId) return;
      var t = findTask(_state, taskId); if (!t) return;
      if (e.target.classList.contains("owner-input")) t.owner = e.target.value;
      else if (e.target.classList.contains("memo")) t.memo = e.target.value;
      else if (e.target.classList.contains("name-input")) setTaskName(_state, taskId, e.target.value);
      else if (e.target.classList.contains("sm-name")) setTaskName(_state, taskId, e.target.value);
      else if (e.target.classList.contains("cl-note")) setChecklistNote(_state, taskId, e.target.getAttribute("data-item-id"), e.target.value);
      else if (e.target.classList.contains("cl-text")) setChecklistText(_state, taskId, e.target.getAttribute("data-item-id"), e.target.value);
      else return;
      persist();
    });
  }

  var Dashboard = {
    WEIGHTS: { high: 3, mid: 2, low: 1 },
    defaultData: defaultData,
    tasksInGroup: tasksInGroup,
    groupByKind: groupByKind,
    statusToProgress: statusToProgress,
    taskProgress: taskProgress,
    loadData: loadData,
    saveData: saveData,
    exportData: exportData,
    importData: importData,
    render: render,
    toggleChecklistItem: toggleChecklistItem,
    setChecklistImportance: setChecklistImportance,
    setTaskStatus: setTaskStatus,
    setTaskDue: setTaskDue,
    toggleSmallDone: toggleSmallDone,
    addSmallTask: addSmallTask,
    removeTask: removeTask,
    setTaskName: setTaskName,
    addChecklistItem: addChecklistItem,
    removeChecklistItem: removeChecklistItem,
    setChecklistNote: setChecklistNote,
    setChecklistDue: setChecklistDue,
    setChecklistText: setChecklistText,
    todayStr: todayStr,
    ddayLabel: ddayLabel,
    isUrgent: isUrgent,
    collectToday: collectToday,
    taskTokenTotal: taskTokenTotal,
    dailyTokenSeries: dailyTokenSeries,
    setTab: setTab,
    init: init,
    applyImportedJson: applyImportedJson,
    sheetCsvUrl: sheetCsvUrl,
    parseCsv: parseCsv,
    parseSheetData: parseSheetData,
    getSheetId: getSheetId,
    setSheetId: setSheetId,
    clearSheetId: clearSheetId,
    applySheetData: applySheetData,
    loadFromSheet: loadFromSheet,
    refreshTokensTab: refreshTokensTab,
    dataToSheetRows: dataToSheetRows,
    saveToSheet: saveToSheet,
    schedulePush: schedulePush,
    pullFromSheet: pullFromSheet,
    mode: function () { return MODE; }
  };
  global.Dashboard = Dashboard;

  if (typeof document !== "undefined") {
    var el = document.getElementById("app");
    if (el) Dashboard.init(el);
  }
})(typeof window !== "undefined" ? window : this);
