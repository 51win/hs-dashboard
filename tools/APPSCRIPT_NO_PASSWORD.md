# Apps Script 웹앱 — 비밀번호 없는 버전

편집 사이트(`edit.html`)는 로컬에서만 열고, 쓰기 주소(웹앱 URL)도 공유 사이트에는
넣지 않습니다(=공개 코드에 노출 안 됨). 그래서 비밀번호 검증을 빼고, **주소를 아는
경우에만 쓸 수 있는** 단순한 형태로 둡니다.

> 보안 메모: 비밀번호가 없으므로 보호는 "웹앱 URL을 비밀로 유지"하는 데 의존합니다.
> URL이 유출되면 누구나 시트에 쓸 수 있으니, `edit.html`은 공유/배포하지 마세요.
> 더 강한 보호가 필요하면 비밀번호 버전(`ADMIN_PASSWORD_APPSCRIPT.md`)으로 되돌릴 수 있습니다.

## 1. Apps Script 코드 교체

데이터 시트 → 확장 프로그램 → Apps Script → `Code.gs` 내용을 **전부 지우고** 아래로 교체:

```javascript
const SHEET_ID = '1HOGCNHqX6Ps-BlNqUXf3w9rxs4KRRY2VyOjuISBk4WE';

function doGet(e) {
  const cb = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : 'cb';
  try {
    const body = JSON.parse((e && e.parameter && e.parameter.payload) || '{}');
    const ss = SpreadsheetApp.openById(SHEET_ID);
    writeTab(ss, 'Tasks',
      ['id','group','name','status','owner','due','doneAt','memo'],
      body.tasks || []);
    writeTab(ss, 'Checklist',
      ['taskId','id','text','note','importance','done','due','doneAt'],
      body.checklist || []);
    return jsonp(cb, { ok: true, tasks: (body.tasks||[]).length, checklist: (body.checklist||[]).length });
  } catch (err) {
    return jsonp(cb, { ok: false, error: String(err) });
  }
}

function writeTab(ss, name, header, rows) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  const out = [header].concat(rows.map(function (r) {
    return header.map(function (h) { return r[h] == null ? '' : r[h]; });
  }));
  sh.getRange(1, 1, out.length, header.length).setValues(out);
}

function jsonp(cb, obj) {
  return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
```

(이전에 만든 `ADMIN_PASSWORD` 스크립트 속성은 더 이상 쓰이지 않으니 지워도 됩니다.)

## 2. 다시 배포 (중요)

코드를 바꾼 뒤에는 **반드시 새 버전으로 다시 배포**해야 반영됩니다.
- 배포 → 배포 관리 → (연필) 편집 → 버전 "새 버전" → 배포.
- 실행 주체 = 나(Me), 액세스 = 모든 사용자(Anyone). URL(`/.../exec`)은 그대로 유지됩니다.

URL이 그대로면 `edit.html`의 `DASHBOARD_WRITE_ENDPOINT`는 바꿀 필요 없습니다.

## 3. 확인

`edit.html`을 열고 아무 과제나 수정 → 상단 배너에 "시트에 게시됨 ✓" 가 뜨면 성공.
공유 사이트(`index.html`)에서 "새로고침"하면 반영됩니다.
