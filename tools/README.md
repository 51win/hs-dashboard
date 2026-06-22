# 토큰 자동 기록 (statusLine 연동)

`tools/statusline.mjs`는 Claude Code의 statusLine으로 동작하면서, 매 틱마다 세션
토큰 사용량을 계산해 대시보드가 읽는 `dashboard-tokens.js`를 자동 갱신합니다.

## 동작

1. Claude Code가 stdin으로 주는 세션 JSON을 받습니다.
2. `transcript_path`(세션 기록 JSONL)를 읽어 assistant 메시지들의 토큰(input+output+cache)
   합 = 세션 누적 토큰을 계산합니다.
3. 세션별 스냅샷을 `.dashboard-token-log.json`에 갱신(세션 id 기준이라 같은 세션을
   다시 돌려도 중복 합산되지 않음).
4. 대시보드 폴더에 `dashboard-tokens.js`를 다시 생성합니다:
   `window.DASHBOARD_TOKENS = { generatedAt, daily: [{date, tokens, cost}] }`.
5. stdout으로 짧은 상태문자열(토큰·비용)을 출력해 statusLine 본연의 역할도 합니다.

대시보드(`dashboard.html`)는 `<script src="dashboard-tokens.js">`로 이 파일을 선택적으로
읽어 "토큰" 탭의 전체 추이 그래프에 표시합니다. 파일이 없어도 에러 없이 동작합니다.

## 설정

`~/.claude/settings.json`(전체) 또는 프로젝트 `.claude/settings.json`에 추가:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /Users/ohhanseung/HS_Dashboard/tools/statusline.mjs",
    "padding": 0
  }
}
```

대시보드 폴더를 다른 곳으로 두려면 환경변수로 지정할 수 있습니다(없으면 스크립트의
상위 폴더 = 이 프로젝트 루트로 자동 인식):

```bash
export CLAUDE_DASHBOARD_DIR="/Users/ohhanseung/HS_Dashboard"
```

설정 후 다음 상호작용부터 status line이 갱신되고, 대시보드를 새로고침하면 그래프에
반영됩니다.

## 직접 테스트(모의 입력)

```bash
echo '{"session_id":"test","model":{"display_name":"Opus"},"cost":{"total_cost_usd":1.23},"transcript_path":""}' \
  | node /Users/ohhanseung/HS_Dashboard/tools/statusline.mjs
# stdout 예: [Opus] 🪙 0 tok · $1.23
# 그리고 dashboard-tokens.js 가 갱신됩니다.
```

## 한계

statusLine은 작업이 어떤 "과제"에 속하는지 알 수 없어서, **자동 기록은 날짜별 전체
합계만** 채웁니다. 과제별 토큰 비교는 대시보드 편집 패널에서 직접 입력합니다.

생성물(`dashboard-tokens.js`, `.dashboard-token-log.json`)은 git에서 제외됩니다.
