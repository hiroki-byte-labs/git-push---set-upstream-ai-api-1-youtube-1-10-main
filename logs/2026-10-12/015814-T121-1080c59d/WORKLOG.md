# 作業記録 T121
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-12T01:58:14Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
利用者の許可（2026-10-11）: 購読枠の使用を許可。Antigravityの実機確認（対話セッションのHook動作、GEMINI.mdの読込み）などT121の残課題を継続する。
途中で利用者から追加の指示（2026-10-12）: パッチの適用は自分で実行して確認する。今後、利用者への確認は不要。確認するようならSkill等に記載し、以降は確認しない仕組みを作る。

## 実施内容・変更ファイル
- 実機確認（購読枠）: Antigravityの対話セッション（利用者のアプリでの作業）の記録をDBから確認。Gateway経由で `agy -p` によるGEMINI.mdの読込み確認を1回、ログイン後の `claude -p`（haiku）を1回実行。Optimizerを実データで1回実行（方針は不変）。
- Hookの誤判定の修正: `orchestration/hooks/detect.ts`（ヒアドキュメント本文の扱い）、`orchestration/tests/detect.test.ts`。パッチ `docs/agent-routing/pending-fixes-5.patch`。
- 確認不要の仕組み: `orchestration/gateway/maintenance.ts`（新規、`agentctl maintenance apply`）、`orchestration/gateway/agentctl.ts`（サブコマンド追加）、`orchestration/tests/maintenance.test.ts`（新規）。規約: `AGENTS.md`（包括許可と例外）、`.agents/skills/model-router/SKILL.md`（「保守」の手順、モデル追加の記述）、`docs/agent-routing/setup.md`（8章）、`operations.md`（モデル追加）。
- パッチ6: `orchestration/hooks/hook.ts`（Hook導入前に始まった対話の実モデルをトランスクリプトから補う）、`orchestration/tests/hooks.test.ts`。`docs/agent-routing/pending-fixes-6.patch`。
- パッチ5・6はいずれも `./scripts/agentctl maintenance apply` で私が適用した（利用者の指示による）。
- 記録: `docs/agent-routing/verification-report.md`（追記4）、`tickets/T121.md`、`docs/STATUS.md`。実機確認のタスクは Git管理外の `work/agentctl-real/`。

## 判断と理由
- 「確認不要」は、保護対象の検証済みパッチ適用と購読枠の実機試験に限って適用した。API課金・契約・課金デプロイ・push・投稿は、リポジトリ規約（AGENTS.md）とこの環境の安全規則により、引き続き明示的承認が必要と明記した。`.codex/hooks.json` の変更後のCodex再信頼は、リポジトリから信頼できない仕様のため利用者の操作として残した。
- 仕組みは口約束でなくコマンドにした: 一時コピーでの全試験に合格しないと本体を変えず、本体での試験が失敗すれば逆適用で戻し、Hook基準ハッシュの更新と計測DBへの記録（`maintenance_patch_applied`）まで行う。これで、利用者の端末操作なしでも、適用の検証と追跡ができる。
- ヒアドキュメントの修正では、本文を一律に無視すると `bash <<EOF` 経由のAI CLI起動や、Pythonの本文からの承認鍵の読み取りを見逃すため、シェルへ流す本文は判定を続け、鍵・DBのパスは本文でも拒否する安全側にした。
- GEMINI.mdの読込み確認は、モデルのターンが要る（print modeに規約一覧がない）。最小のプロンプトで「ツールもファイルも使わずに答えよ」とし、文書固有の記述が答えに出るかと入力トークンの増分で判断した。ツール不使用は記録上証明できないことを明記した。
- 定型作業の評価（routine-to-skill）: 2026-10-11〜12に5回繰り返した「保護対象の変更を一時コピーで検証してパッチにし適用する」手順を、model-router Skillの「保守」節としてSkill化し、`agentctl maintenance apply` で自動化した。パッチ6の適用で試用し、手順どおりに動いた。

## 検証コマンド・結果・証跡
- `./scripts/agentctl run --task work/agentctl-real/rules-agy.json` → completed（gemini-3.8-flash-low、16,112トークン measured）。回答はGEMINI.mdの規則を正しく要約（evidence/real-run-rules-agy.json）。
- `./scripts/agentctl run --task work/agentctl-real/claude.json` → completed（claude-haiku-5-5、36,766トークン measured、報告額 $0.00303531、推定 $0.004029）（evidence/real-run-claude.json）。
- パッチ5: 一時コピーで71件合格（evidence/pending-fixes-5-tests.txt）。`./scripts/agentctl maintenance apply docs/agent-routing/pending-fixes-5.patch` → applied、一時コピー・本体の全試験と型検査が合格、基準更新（evidence/maintenance-apply-5.json）。適用後、このセッションで本文に `codex 0.161…`・`claude -p` を含む `cat <<'EOF'` が exit 0 で通ることを確認。
- maintenance の試験3件（合格のときだけ適用、失敗なら本体不変、適用不可のパッチ）合格。
- パッチ6: 一時コピーで75件合格、`maintenance apply` → applied（evidence/maintenance-apply-6.json）。
- `./scripts/agentctl optimize due` → since_last_proposal 11 / threshold 50 / due false。`optimize propose` → no_change（全戦略で評価済み0件）（evidence/optimizer-real.json）。
- 全体: 75件合格、型検査 exit 0（evidence/tests-final.txt）。`./scripts/agentctl doctor --audit` → 監査で未観測0件（Claude 2・Codex 16）、warn は version_codex_app（デスクトップ 0.162.0-alpha.2）・version_changed・GEMINI_API_KEY未設定・過去のHookエラー記録・パッチ3前の子1件（evidence/doctor-final.json）。
- 同時作業の確認: 作業回の間に変わったファイルはすべて本回の変更。02:03 UTCにCodexデスクトップのセッションが agentctl を1回実行した記録があるが、ファイル変更はなかった。

## 未実施・制約
- Codexデスクトップアプリ（0.162.0-alpha.2）でのサブエージェントのモデル注入は未確認（エージェントからデスクトップアプリを操作できない）。デスクトップでもHook自体は動いている（DBの記録）。
- Antigravityの対話は発言本文がHookに来ないため、発言ごとのタスク分割と難易度の推定ができない（既定L2・会話単位）。
- コスト削減の実測は、評価つきの実績がないため不可。
- `database is locked` の原因は未再現（再発監視）。

## TODO・再開方法
- tickets/T121.md「ブロック理由と再開」の1〜4。利用者の操作は不要（AGENTS.md の包括許可）。保護対象の変更は model-router Skill「保守」の手順と `agentctl maintenance apply` で行う。
