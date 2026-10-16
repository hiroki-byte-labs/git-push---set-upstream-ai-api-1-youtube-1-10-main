---
name: routing-optimizer
description: このリポジトリで蓄積した実行実績から、モデル別・タスク種別別の費用対効果（品質を満たしたタスク1件当たりの総コスト）を分析し、Model Routerの方針の改善案を作る。実績が一定件数たまったとき（agentctl optimize due）またはPMが指示したときだけ使う。毎回の作業開始時や、PMの確認なしに方針を変える用途には使わない。
---
# Routing Optimizer（ルーティングの改善提案）

正本は `orchestration/optimizer/optimizer.ts`。分析・提案は自動、方針の変更はPM（Codexのproject-orchestrator）または人の確認後だけ。

## いつ実行するか
- `scripts/agentctl optimize due` が `due: true`（前回の提案以降の完了・失敗が方針の `trigger_every_n_executions` 件以上）、またはPMの指示があるとき。
- 毎回は起動しない。分析にLLMは使わない。

## 手順
1. 提案を作る: `scripts/agentctl optimize propose`。方針ファイルは変わらない。`data/optimizer/<提案ID>.md` が報告書。
2. 判断基準: タスクごとに「最初に選ばれたモデル」を戦略とし、そのタスクの全実行（失敗・再試行・上位切替えを含む）の費用を合計し、品質評価が合格したタスク数で割る。安くても失敗が多い戦略は効率的と判断しない。評価のないタスクは合格に数えない。
3. 実績不足（各戦略の評価済みタスクが `min_samples_per_group` 件未満）の組合せは提案しない。製品をまたいで費用を比べられない場合（単価未確認のモデルがある）も提案しない。
4. PMの確認: Codexのproject-orchestratorが `scripts/agentctl optimize review <提案ID> --decision approve|reject --reviewer codex-pm`（人は端末から）。Claude Code・Antigravityからは拒否される。
5. 適用: `scripts/agentctl optimize apply <提案ID>`（人またはCodexのPM）。旧版は `data/policy-history/` に保存され、変更履歴がDBに残る。`routing-policy.json` は作業ログの対象ファイルなので、適用は作業回（worklog start/finish）の中で行い、変更をチケットに書く。
6. 適用後: 実績がたまったら `scripts/agentctl optimize check`。合格率が `max_pass_rate_drop` より下がっていれば `degraded`。`--auto-rollback` か `scripts/agentctl optimize rollback --reason <理由>` で以前の設定に戻す。

## 比較実測を増やすとき
- 実行前に、比較する戦略、課題数、購読枠のターン数・トークン見込み、課金方式を作業ログへ書く。API相当額と購読枠の実請求額を混同しない。
- 同じ課題を各戦略へ1回ずつ割り当て、成果物と決定的な `test_command` で合否を判定する。課題の表現や期待値を戦略ごとに変えない。不合格も再実行で消さず、その戦略の実績として残す。
- `min_samples_per_group` はtask_type・difficulty・開始モデルの組合せごとの件数。課題内容の種類を増やしても、比較群のキーを不用意に分散させない。
- `optimize due` の閾値に達する実行数も計画へ含める。実行後は各executionへ `agentctl status <ID> --require-metered` を行い、全件の計測状態、合否、トークン、API相当額を集計してから `propose` する。
- PM reviewでは費用/合格だけでなく、方針の `min_pass_rate` と実際の失敗内容を確認する。品質下限を満たさない安価な戦略を、費用だけで承認しない。

## 品質評価の記録
自動評価は試験（`test_command`）・成果物（`expected_artifacts`）があるタスクだけ。人やレビュー担当の評価は `scripts/agentctl evaluate --execution <ID> --passed true|false --kind human|agent`。評価がない実績は提案の根拠にならない。
