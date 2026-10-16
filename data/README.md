# data/（agentctlの実行時データ）

Git管理外（.gitignore）。作業ログの終了検査の対象にもならない。消すと計測履歴・承認記録・方針の旧版が失われる。

- `telemetry.db` … 計測DB（SQLite）。タスク・ルーティング判断・承認・実行・使用量・評価・Hookのイベント・改善提案・方針の変更履歴。プロンプト本文・APIキー・動画の内容は保存しない。
- `runs/<task_id>/<execution_id>/` … Gatewayの実行ごとの routing-decision.json、execution.json、CLIの標準出力・標準エラー（モデルの応答本文を含みうるため共有しない）。
- `optimizer/` … 改善提案（JSONと報告書）。
- `policy-history/` … 適用・復元の前に保存したrouting-policy.jsonの旧版。
- `hook-errors.log` … Hookの内部エラー。
- `auth-cache.json` … agentctl init 時点の認証経路（秘密値は含まない）。

承認鍵はここではなく、リポジトリ外の `~/.config/agentctl/approval.key`（権限0600）にある。手順は docs/agent-routing/setup.md。
