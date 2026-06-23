# 관리자 비밀번호 모드 — Google Apps Script 웹앱 (OAuth 불필요)

목표: 대시보드에서 **비밀번호를 입력하면 관리자 모드**가 열리고, 수정 내용이 구글 시트에
저장된다. Google Cloud 프로젝트/ OAuth 없이, 시트에 붙인 Apps Script만으로 구현.

## 보안 원리 (중요)

- 정적 사이트(Pages)의 JS·HTML은 전부 공개로 보입니다. **비밀번호를 클라이언트 코드에서
  비교하면 안전하지 않습니다**(소스 노출·우회 가능).
- 그래서 비밀번호 검증과 시트 쓰기는 **서버(Apps Script)** 에서 합니다.
  - 비밀번호는 Apps Script **Script Properties**(서버 비밀)에 저장 → 공개 코드에 없음.
  - 시트는 공개 "뷰어"(읽기)만, **쓰기 권한은 아무에게도 부여하지 않음**.
  - 웹앱이 **소유자 권한**으로 시트에 쓰되, 요청의 비밀번호가 맞을 때만 씀.
- 결과: 대시보드는 사용자가 입력한 비밀번호를 https로 웹앱에 전달만 하고, 맞는지 판단은
  서버가 함. 비밀번호·쓰기 권한이 공개 코드 밖에 있어 실제로 안전.

## 한승이 할 일 (5분, Google Cloud 불필요)

1. 데이터 구글 시트 열기 → 메뉴 **확장 프로그램 → Apps Script**.
2. 아래 코드를 **전부 지우고** 붙여넣은 뒤 저장(`Code.gs`). 대시보드는 JSONP(GET) 로
   호출하므로 `doGet`을 씁니다(브라우저 CORS 우회 + 응답을 읽어 정확한 오류 표시):

```javascript
// 시트에 쓰기 + 비밀번호 검증. 읽기는 대시보드가 gviz로 직접 함(여기선 쓰기만).
const SHEET_ID = '1yYy_uxc7C-fLaIfVTl88dGKxSDgvWn3emEgxNKF7otY';

function doGet(e) {
  const cb = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : 'cb';
  try {
    const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
    const body = JSON.parse((e && e.parameter && e.parameter.payload) || '{}');
    if (!expected || body.password !== expected) {
      return jsonp(cb, { ok: false, error: 'unauthorized' });
    }
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

> 빠른 점검: 저장 후 Apps Script 편집기에서 함수 `doGet`을 한 번 실행해 권한(시트 접근)을
> 승인해 두면 첫 호출이 매끄럽습니다.

3. 좌측 **프로젝트 설정(톱니) → 스크립트 속성 → 속성 추가**:
   - 이름 `ADMIN_PASSWORD`, 값 = 원하는 **고유 비밀번호**(길고 추측 어렵게).
4. **배포 → 새 배포 → 유형: 웹 앱**
   - 실행 주체(Execute as) = **나(Me)**
   - 액세스 권한(Who has access) = **모든 사용자(Anyone)** ← 익명 접근 허용이 핵심.
   - 배포 → 권한 승인(본인 계정) → **웹 앱 URL** 복사(`https://script.google.com/macros/s/.../exec`).

   ⚠️ **코드를 바꾼 뒤에는 반드시 다시 배포해야 반영됩니다.** Apps Script는 이전 배포 버전을
   계속 제공하므로, 위 코드로 교체했다면 **배포 → 배포 관리 → (연필) 편집 → 버전: "새 버전" →
   배포**, 또는 "새 배포"를 다시 하세요. (URL이 같은 `/.../exec`로 유지되면 그대로 쓰면 됨.)
5. 그 **웹 앱 URL**을 알려주세요. (비밀번호는 알려줄 필요 없음 — 서버에만 있으면 됨.)

## 저장이 시트에 반영 안 될 때 체크리스트

- 대시보드를 **https(GitHub Pages)** 에서 열고 있나요? `file://` 로컬에서는 동작하지 않습니다.
- 코드 교체 후 **새 버전으로 다시 배포**했나요? (가장 흔한 원인)
- 웹앱 액세스 권한이 **모든 사용자(Anyone)** 인가요?
- 스크립트 속성 `ADMIN_PASSWORD` 값과 대시보드에서 입력한 비밀번호가 **정확히** 같나요?
  (이제 비밀번호가 틀리면 대시보드가 "비밀번호가 틀렸습니다"라고 표시합니다.)
- `SHEET_ID`가 우리 시트와 같나요?

## 내가 구현할 것 (URL 받으면)

- 대시보드에 "관리자" 버튼 → 비밀번호 입력(모달). 입력값은 메모리/세션에만 보관.
- 관리자 모드에서 편집 UI(에디터·추가·저장·작은 과제) 노출. 평소(뷰어)엔 읽기 전용.
- "저장" = 현재 데이터를 Tasks/Checklist 행으로 역매핑 → 웹앱에 `POST {password, tasks, checklist}`
  (CORS 회피 위해 `Content-Type: text/plain`로 전송) → 응답 `ok:true`면 성공 토스트,
  `unauthorized`면 비밀번호 오류 안내.
- 저장 후 시트가 갱신되므로, 새로고침하면 모두에게 반영.
- 데이터→행 역매핑은 헤드리스 테스트로 검증.

## 보안 메모 / 한계

- 웹앱 URL이 공개 코드에 들어가도 됩니다 — 비밀번호 없이는 쓰기가 거부됩니다.
- 비밀번호는 충분히 길게(무차별 대입 방지). 필요하면 스크립트에 간단한 시도 제한도 추가 가능.
- https로만 전송되므로 도청 위험은 낮음. 비밀번호 유출 시 Script Properties에서 즉시 교체.
- 더 강한 보안이 필요해지면 나중에 토큰 회전·서명 검증 등을 얹을 수 있음.
```
