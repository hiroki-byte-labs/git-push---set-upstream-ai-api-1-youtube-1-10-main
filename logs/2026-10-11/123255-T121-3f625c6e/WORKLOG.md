# 作業記録 T121
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-11T12:32:55Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
利用者の許可（2026-10-11）: codexとagyの実機試験を最小のプロンプトで各1回行う（購読枠を使用。API課金・Claude実行はしない）。あわせて利用者が適用した修正パッチ（pending-hook-fixes.patch）の検証と記録、検証レポートへの結果追記。

## 実施内容・変更ファイル
- 前回の作業回（112432-T121-e0af6838）の終了後に、利用者が `docs/agent-routing/pending-hook-fixes.patch` を適用していた（12:19 UTC、`orchestration/hooks/detect.ts`・`hook.ts`、`orchestration/tests/detect.test.ts`・`hooks.test.ts`）。私が一時コピーで作った検証済みの4ファイルと `cmp` で完全一致を確認し、この作業回で記録した。利用者はCodexでプロジェクト・Hookを信頼し、`agentctl init` で基準ハッシュを更新していた（doctorで確認。私は信頼設定を変更していない）。
- 実機試験用のタスク（Git管理外 `work/agentctl-real/`、プロンプト「OKとだけ返す」、L1、再試行0・上位切替え0）を作り、`./scripts/agentctl run` で Codex と Antigravity を各1回実行した。
- 変更: `orchestration/gateway/gateway.ts`（結果にモデルIDがない製品は、子セッションのHookが記録した照合結果で最終判定する）、`orchestration/tests/gateway.test.ts`（その試験を追加）、`docs/agent-routing/verification-report.md`（1章・2章・7章へ追記）、`architecture.md`（7章の表）、`operations.md`（PMの操作の注記）、`troubleshooting.md`（リダイレクト誤判定の行）、`tickets/T121.md`、`docs/STATUS.md`。

## 判断と理由
- 許可は「各1回」なので、予算の `max_retries` と `max_escalations` を0にし、失敗しても再試行・上位切替えが起きないようにした。Gatewayの修正後に agy を再実行して確かめることは許可範囲を超えるため行わず、修正は自動テストで確認した。
- 作業ディレクトリはリポジトリにした（子セッションでこのリポジトリのHookが読まれることを確認するため。Codexは信頼済みのプロジェクトでだけHookを読む）。
- Antigravityの結果JSONにはモデルIDがないが、子セッションのPreInvocation Hookが `modelName` で承認と照合できることが実機で分かった。それを最終判定に使うことで、Antigravityでも「承認と実モデルが異なる実行を失敗にする」がGatewayの判定に入る。
- 利用者のCodex対話セッションの記録は、メタデータ（推奨・難易度・文字数・ハッシュ）だけを証跡に含め、プロンプト本文は読んでいない（DBにも保存されない）。
- T121は、Antigravityの対話セッションからの開始と、両製品のサブエージェントが実機未確認のため、doneにせずreviewのままにした。

## 検証コマンド・結果・証跡
- パッチ適用後: `node --test orchestration/tests/*.test.ts` → tests 61 / pass 61、型検査 exit 0（evidence/tests-after-patch.txt）。`./scripts/agentctl doctor` → Codexのプロジェクト・Hookの信頼、基準ハッシュがok、warnはClaude CLI未ログインとGEMINI_API_KEY未設定だけ。
- `./scripts/agentctl plan` → Codex: gpt-6-luna（light、low、subscription_quota）、Antigravity: gemini-3.8-flash-low（light）、validation ok。
- `./scripts/agentctl run --task work/agentctl-real/codex.json` → completed、exit 0、10.3秒、応答「OK」。使用量（rollout、measured）: 入力18,780（キャッシュ6,912）、出力5、推論0、合計18,785。`turn.completed` の値と一致（evidence/real-run-codex.json、real-runs.txt）。
- `./scripts/agentctl run --task work/agentctl-real/antigravity.json` → completed、exit 0、13.2秒、応答「OK」。使用量（measured）: 入力15,028、出力1、思考0、キャッシュ0、合計15,029、API相当額 $0.011275（推定）（evidence/real-run-agy.json、real-runs.txt）。
- 子セッションのHook: `child_session_verified`（codex、gpt-6-luna、12:33:32）、`child_session_verified`（antigravity、gemini-3.8-flash-low、12:33:58）。承認は各1件、発行・消費済み。
- 利用者のCodex対話: UserPromptSubmit で interactive の実行（実モデル gpt-6-astra、推奨 gpt-6.1-sol、L2/general）を記録。このClaude Codeセッションでも利用者の発言で推奨（claude-sonnet-5-5）を記録。
- `./scripts/agentctl status <task> --require-metered` → 両方 exit 0。`./scripts/agentctl doctor --audit` → Hook導入以降のCodex 2セッションは観測済み、未観測0件、exit 0（evidence/doctor-audit-after.json）。
- Gateway修正後: `node --test orchestration/tests/*.test.ts` → tests 62 / pass 62、型検査 exit 0（evidence/tests-final.txt）。

## 未実施・制約
- Antigravityの対話セッションから始めた場合のHook動作（推奨の記録、run_commandへの `ask` の影響）は未確認。
- Codex・Antigravityのサブエージェントの実機確認は未実施（今回の許可範囲外）。Claude CLIは未ログインのためGateway経由のClaude実行は未実施。
- `agy -p` のusageの包含関係は、今回の思考・キャッシュがともに0だったため判定できなかった。
- Gatewayの修正（子セッションの照合を最終判定に使う）は自動テストのみで、実機での再実行はしていない。
- Hook誤判定（コマンド本文に承認鍵のパス文字列があるだけで拒否）は未修正。コスト削減の実測なし。
- 定型作業の評価: 今回は前回作成したtoken-monitor Skillの手順（`status --require-metered`）を実機の実行に使い、手順の変更は不要だった。新しい反復候補はないため、Skillの作成・更新は見送った。

## TODO・再開方法
- 利用者の判断: Antigravityの対話セッションでの確認方法と `ask` の運用、両製品のサブエージェントの実機試験の可否、Claude CLIのログイン。
- 実施する場合は新しい作業回で、`./scripts/agentctl status` と `doctor --audit` の結果を verification-report.md に追記する。
- 実運用の実績がたまったら `./scripts/agentctl optimize due` → `propose`（PM確認）。
