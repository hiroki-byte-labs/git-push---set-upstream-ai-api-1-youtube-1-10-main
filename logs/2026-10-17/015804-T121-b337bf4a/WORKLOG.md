# 作業記録 T121
- 記録者・実施者: Codex
- モデル: gpt-6.1-sol (runtime)
- 開始日時: 2026-10-17T01:58:04.262Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
昨日のモデル別消費と委譲実績を調査し、他製品への配分が増えるようRouter方針・委譲手順を保守適用と実機試験で修正する

## 実施内容・変更ファイル
- 昨日JST（2026-10-16）と当該チャットの実行/計測を調査し、initiator優先と推薦/実行の区別、親が委譲していなかった事実を特定した。
- `orchestration/model-registry/routing-policy.json` を一時コピーで役割別優先へ改定。`orchestration/hooks/hook.ts` に別製品の推奨ではagentctl runが必要との案内を追加し、既存router/hooks試験を更新、provider-distribution回帰3件を追加した。保護対象は直接編集せず検証済みパッチを保守適用した。
- `.agents/skills/model-router/SKILL.md` とissue-to-improvementを更新し、許可済み分担では独立単位を実際にGatewayへ渡すこと、親/子の範囲、必要な入力だけの引渡し、計測と成果確認を明記した。
- `docs/agent-routing/DELEGATION-DISTRIBUTION.md` を追加し、architectureの旧優先例を更新。T121/STATUSへ原因・実施結果・制約を記録した。
- Claude/Antigravityへ各1件の読取専用子作業を実行し、成果を親で評価。親のT121作業回は保持し、子にはファイル変更/start/finish/再委譲をさせていない。

## 判断と理由
- 昨日全体で他製品の消費がないという仮説は記録と一致せず、Antigravity対話22件があった。ただし管理CLI委譲はCodex6件のみで、このチャットも7対話回すべてCodex/委譲0だった。Routerのinitiator優先と、親が推薦を見ても子作業を起動していなかったことの両方を直す必要がある。
- 利用者が他製品への配分を明示的に希望したため、実装/設計/レビューClaude、分析/抽出/要約等Antigravity、全体調整Codexを優先する。現在は3製品とも購読認証がある。品質tier・能力・トークン上限・L4の独立性・課金無効は維持し、認証不在時の候補探索も検査した。
- Optimizerは評価済み群が不足しno_change。今回は費用効率の実証に基づく最適化ではなく、利用者の分担方針の変更として保守手順で適用した。変更前/後と判断を `evidence/policy-before.json`, `policy-after.json`, `change-rationale.json` に保存した。均等比率や費用削減は保証しない。
- 実機試験は短いreview/analysis各1件、購読、再試行/上位切替え0、各max_total_tokens200000（Router見積各120000）で行った。異なる課題なので比較ベンチマークではない。Claudeのレビューには上位tier探索を見落とす誤記があり、品質不合格として残した。成果は親で照合する必要がある。
- 定型作業評価: T121の過去実機/Hook補修と今回の偏り調査で、推薦表示を分担実施と混同する問題が反復し、利用者も分担改善を希望した。新Skillは作らず既存model-routerと直前のissue-to-improvementへ実際のrun/成果/計測確認を追記し、今回の2子作業へ適用した。複製された保守手順は増やしていない。

## 検証コマンド・結果・証跡
- 開始時 `cli.ts check` は155 tickets/163 sessionsで成功、next確認、README/SPEC/STATUS/AGENT-WORKFLOWとT121/依存T112、Model Router/Optimizer/Token Monitorを参照した。登録簿の場所を最初に誤指定したcatは失敗し、正本model-registryから読み直した。
- `agentctl usage/report --since 2026-10-15T15:00:00Z` とdoctorで現状を確認。昨日の厳密な上下限はSELECTだけのsqlite3で実行/usageを別集計（`evidence/yesterday-executions.json`, `yesterday-usage.json`, `chat-executions.json`）。最初のNode readonly接続案はHookがDB直接操作として拒否したため実行されず、規約で許されるSELECT専用sqlite3へ切替えた。DBを直接変更していない。
- `agentctl optimize propose` はno_change（`evidence/optimizer-proposal.txt`）。実績不足のため費用最適化を承認/適用したとはしない。
- tarでa/bの一時コピー `/tmp/T121-routing-ecV9YZ` を作り、node_modulesのみリンク。回帰3件の変更前はpass1/fail2・終了1（`evidence/before-policy.txt`）。方針変更直後は既存Hook試験が旧推薦を期待して失敗し、期待値と案内を更新した（`evidence/scratch-tests.txt`）。
- コピーの最終 `node --test orchestration/tests/*.test.ts` は83/83成功・終了0（`evidence/scratch-tests-final.txt`）、`tsc --noEmit -p orchestration/agentctl.tsconfig.json` 終了0（`evidence/scratch-typecheck-final.txt`）。
- `diff -ruN -x node_modules a b` でパッチ作成（差分ありの終了1）、`git apply --check` 成功後、`agentctl maintenance apply docs/agent-routing/T121-provider-distribution-2026-10-17.patch` を実行。コピー/本体の試験・型検査、適用、Hook基準更新の全step成功、applied=true/retrust=false/終了0（`evidence/maintenance-apply.json`）。Hook設定JSONは変更していない。
- `agentctl plan` がreview→claude-sonnet-5-5、analysis→gemini-3.8-flash-medium、subscription/validation okを確認（`evidence/claude-plan.json`, `agy-plan.json`）。続けて各 `agentctl run --task` がcompleted/measured/終了0（`evidence/claude-live.txt`, `agy-live.txt`）。
- 子task `tsk_0mvbr2ti22a458c392756` と `tsk_0mvbr2ti75b27159f1a65` の `status --require-metered` は両方終了0（`evidence/claude-metering.json`, `agy-metering.json`）。実測25026/18799tokens、再試行0、上位切替え0。出力は `evidence/live-review-results.json`。Claudeの同tier限定という記述は実装に反するためevaluate quality=false、Antigravityは集計一致でtrueを記録（`evidence/quality-evaluations.json`）。
- 更新Skill2件のofficial quick_validateは既存PyYAMLを用いて両方終了0（`evidence/skill-validation.txt`）。新規文書/architectureのローカルリンク実在と `git diff --check` 終了0（`evidence/diff-check.txt`）。
- 適用後doctorでpolicy2026-10-17.1/Hook基準一致/ClaudeとAntigravity購読認証/信頼済みHookを確認（`evidence/doctor-after.json`）。親 `tsk_0mvbqy8do4b5d7cb72497` のrequire-meteredはmissing/終了4（`evidence/parent-metering.txt`）。親の未計測を成功扱いしない。

## 未実施・制約
- 今回は役割別優先と明示的委譲の導線を改善した。トークン等分、購読残枠に応じた動的分散、費用最小化、全タスク種別の実品質比較は未実施。現在の親Codex対話の消費は残る。
- 子2件は実行/計測成功だが、Claudeの成果には品質不合格を記録した。自動で全成果を合格にせず、親の照合を継続する。品質比較に必要な評価済み件数は不足している。
- Antigravity CLI1.4.0とCodexアプリの版変更警告が残る。今回CLI子作業のモデル照合/計測は成功したが、製品内サブエージェントの全能力を再検証してはいない。
- API課金/契約/投稿/push/commit/Hook設定JSONの変更はしていない。既存の未コミット差分と終了済みログを保持。管理子の計測は完了、親対話はmissingのまま未完了。

## TODO・再開方法
- T121の今回の配分修正・保守適用・CLI実機試験は完了。次回はModel Router/issue-to-improvementに従い、独立した実装/調査/レビューを子taskへ渡し、親は統合・最終検証を行う。planだけで分担済みにしない。
- 実績がたまったら既存Optimizerの品質下限/最少評価件数で効果を確認する。品質不合格も消さず蓄積し、単に安い/件数が多いだけで選ばない。
- 元方針に戻す必要があれば、保存した変更前JSONとパッチを参照し、一時コピーで逆パッチを検証してmaintenance applyで戻す。保護対象への直接編集や基準の迂回をしない。
- 親対話の使用量は正規Hook取込後に再確認する。製品内子の版変更警告の確認は必要な場合に別作業回で行う。閉じた本ログには追記しない。
