---
name: token-monitor
description: このリポジトリの管理対象エージェント実行（agentctl run、Hookで観測した対話・サブエージェント）のトークン使用量・実行時間・費用・再試行を確認し、タスク終了前に計測が完了しているかを検査する。「使用量を確認」「計測できているか」「モデル別の消費」「タスク終了前の計測確認」で使う。計測値を手で補完・推測する用途には使わない。
---
# Token Monitor（使用量の計測）

正本は `orchestration/telemetry/`（正規化 `normalize.ts`、記録・集計 `monitor.ts`、DB `db.ts`）と `schemas/usage.schema.json`。計測にLLMは使わない。DBは `data/telemetry.db`（Git管理外）。

## 記録される値
- 入力合計（キャッシュ読み・書きを含む）とその内数、出力合計（推論を含む）とその内数、総トークン、実行時間、API相当額（推定）、製品が報告した額、実請求額（取得できないためnull）、購読/API課金の区別、再試行・上位切替え。
- 各値に取得方法 `measured` / `estimated` / `unavailable` が付く。取得できない値はnull。推測で埋めない。
- 同じ結果の再送は1回だけ計上する（dedupe_key）。セッション累積値は差分で計上する。サブエージェントは子の実行に記録し、木で合計する。
- 製品内サブエージェントの子の使用量が取れるかは製品による（`models.json` の `native_subagents.child_usage`）。取れない製品（Antigravity）の子は `unavailable` になる。計測が必要な子作業は `agentctl run` で起動する。
- プロンプト本文・APIキー・動画の内容はDBに入らない（タスクはハッシュと長さだけ）。

## タスク終了前の確認（必須）
1. 自分が起動した管理対象の実行を確認する: `scripts/agentctl status <task_id または execution_id> --require-metered`
2. 終了コード4（未計測）なら正常完了として報告しない。`metering_status` が `unavailable` の理由（製品が使用量を出さない等）を報告に書く。
3. 集計: `scripts/agentctl usage --by model`（`task_type` / `provider` / `initiator` も可）。費用はAPI相当額の推定で、購読枠の実請求額ではない。

## 製品別の取得元と制約（詳細は docs/agent-routing/architecture.md 5章）
- Claude Code: `claude -p --output-format json` の `modelUsage`（サブエージェント込み）、対話はトランスクリプトの `message.usage` をメッセージID単位で取込み（Stop/SubagentStop Hook）。
- Codex: `~/.codex/sessions` のrolloutの `token_usage_record`（応答単位、親スレッドつき）。`exec --json` の `turn.completed.usage` はスレッド累積でサブエージェントを含まない。
- Antigravity: `agy -p --output-format json` の `usage`。対話セッションのHook・トランスクリプトには使用量がないため `unavailable` になる。
- Gemini API: `usageMetadata`。

## してはいけないこと
- `data/telemetry.db` をsqlite3で書き換える（Hookが拒否する。参照はSELECTだけ）。
- 未計測の実行を成功・完了として報告する。
- 実行を通さずに `agentctl ingest` で数値を作る（ingestは製品が出力した実際のJSONを取り込むときだけ使う）。
