# 運用手順（agentctl、T121）

## 1. 別モデル・別製品へ任せる（全製品共通）
1. プロンプトをファイルに書く（例: `work/prompts/summary.md`。`work/` はGit管理外）。
2. タスクファイルを作る（`schemas/task.schema.json`）。例:
   ```json
   {"schema_version":"1","task_id":null,"parent_task_id":null,"title":"READMEの要約","task_type":"summarization","difficulty":null,
    "quality_requirement":"normal","initiator":"codex","agent_name":null,"required_capabilities":[],"preferred_provider":null,
    "budget":{"max_usd":null,"max_total_tokens":null,"max_retries":1,"max_escalations":1},
    "input":{"prompt_file":"work/prompts/summary.md","program":null,"workdir":null,"permission_profile":"read_only"},
    "expected_artifacts":[],"test_command":null,"audit":true}
   ```
   `initiator` は自分の製品（codex / claude / antigravity / human）。親タスクがあれば `parent_task_id`。
3. 選択の確認（実行しない）: `./scripts/agentctl plan --task task.json`
4. 実行: `./scripts/agentctl run --task task.json`（終了コード 0完了 / 1失敗 / 2拒否 / 3人の承認待ち / 4計測なし）
5. 終了前の計測確認: `./scripts/agentctl status <task_id> --require-metered`
6. 品質の評価（試験がないタスク）: `./scripts/agentctl evaluate --execution <exe_id> --passed true --kind human`

`agentctl run` の中から別の `agentctl run` を起動できる（親子が `AGENTCTL_EXECUTION_ID` で結ばれる）。深さは3まで。

## 2. サブエージェント
**別モデルや計測が必要な子作業は `agentctl run` で起動する**（AGENTS.md）。製品内サブエージェントは、親と同じモデルで足り、子の使用量が取れなくてもよい作業に使う。
- Claude Code・Codex（モデル指定ができる）: モデル未指定ならRouterの選んだモデルが入り、違うモデルを指定すると拒否される（拒否理由に使うべきモデルが出る）。同じ種類の子が直前に失敗した場合だけ、1段上の枠を許す。
- Antigravity（モデル指定ができない）: 推奨が親のモデルと同じときだけ許可。違えば拒否され、`agentctl run` へ案内される。子の使用量は取れない（unavailable）。

## 3. 使用量・効率の確認
- `./scripts/agentctl usage --by model`（`task_type` / `provider` / `initiator`、`--since 2026-10-01T00:00:00Z`）
- `./scripts/agentctl report --out work/agentctl-report.md` … モデル別・タスク種別別の集計と、戦略別の合格率・再試行率・上位切替率・合格1件当たりの費用
- `./scripts/agentctl status`（直近20件）、`./scripts/agentctl status <task_id|exe_id>`（実行の詳細・子の合計）

費用はAPI相当額の推定で、購読枠の請求額ではない。購読枠の残量はCodexのrolloutの `rate_limits`（`codex` の `/status`）、Antigravityの `agy -p "/usage"`、Claudeの `/usage` で利用者が確認する。

## 4. ルーティングの改善（PMの作業）
1. 時期の確認: `./scripts/agentctl optimize due`
2. 提案: `./scripts/agentctl optimize propose` → `data/optimizer/<提案ID>.md`
3. 確認（Codexのproject-orchestratorまたは人）: `./scripts/agentctl optimize review <提案ID> --decision approve --reviewer codex-pm --note <理由>`
4. 適用（作業ログを開始してから）: `./scripts/agentctl optimize apply <提案ID> --by codex-pm`。`routing-policy.json` が変わるので、作業ログを閉じるまでに変更をチケットに記録する。ファイルはagentctlが書くため、エージェントの編集ツールに対するHookの保護とは衝突しない（エージェントが直接編集すると拒否される）。適用後は `doctor` の基準ハッシュと異なるので、人が `./scripts/agentctl init` で基準を更新する。
   - CodexのPMのBashからの `optimize review|apply|rollback` は、修正パッチ（`docs/agent-routing/pending-hook-fixes.patch`、2026-10-11に利用者が適用）以降Hookを通る。Claude Code・Antigravityからは拒否される。
5. 適用後の監視: `./scripts/agentctl optimize check`。`degraded` なら `./scripts/agentctl optimize rollback --reason <理由> --by codex-pm`（または `check --auto-rollback`）。

## 5. 従量課金の承認（人だけ）
`agentctl run` が終了コード3で止まったら、表示された判断IDを人が端末で承認し、再開する。

```sh
./scripts/agentctl approve rdc_xxxxx --reason "動画解析のため1回だけ"
./scripts/agentctl run --resume exe_xxxxx
```

承認は1時間で失効する。再試行・上位切替えには新しい承認が要る。

## 6. 定期点検
- 週1回: `./scripts/agentctl doctor --audit`（Hookを通っていないセッション、未計測、Hook設定の改変、Hookの内部エラー、製品の版の変化）
- `version_*` が warn のとき: 製品の更新でHookの入力やサブエージェントの能力が変わりうる。各製品で最小のプロンプトの実機試験を1回行い（購読枠を使うため利用者の許可を得る）、結果で `models.json` の `native_subagents`（能力と `verified_version`）を保守作業で更新する。
- 新しいモデルの追加: 実環境（`codex debug models` / `agy models` / Claude Codeのモデル選択）と公式資料で確認し、`agentctl maintenance apply` の手順（model-router Skill「保守」）で `models.json` に追加（推測しない）。
- 承認鍵の作り直し: 人が `~/.config/agentctl/approval.key` を削除して `./scripts/agentctl init`（発行済みの承認は無効になる）。

## 7. データの扱い
`data/` はGit管理外。`data/runs/` の出力にはモデルの応答本文が残るため共有しない。計測DBにはプロンプト本文・キーは入らない。バックアップは `data/telemetry.db` を `sqlite3 data/telemetry.db ".backup <先>"` で取る（読み取り操作のためHookは許可する）。
