# 作業記録 T121
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-11T11:24:32.751Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
作業指示書「Multi-Agent Model Routing & Token Optimization System」に基づき、Codex・Claude Code・Antigravity共通のmodel-router / token-monitor / routing-optimizer の3 Skill、TypeScriptのExecution Gateway（agentctl）、SQLiteの計測、3製品のHooks、テスト、手順書・検証レポートを実装・検証する。既存設定を削除・上書きしない。有料API・新規契約・キー発行・pushはしない。実モデルを使う試験は費用・範囲を説明して承認を得る。

## 実施内容・変更ファイル
- Phase 0 環境調査（evidence/env-survey.txt）: macOS 26.6 arm64、Node 26.11.1（PATH、SQLite 3.53.4）、Claude Code 2.1.293（CLIは未ログイン）、Codex CLI 0.161.0（ChatGPT購読、既定gpt-6-astra、hooks機能stable）、Antigravity agy 1.3.3（Googleアカウント）、Gemini CLI 0.46.0、APIキーの環境変数はすべて未設定。モデル一覧は `codex debug models`・`agy models`・Claude APIスキルの公式表で確認。各製品のHook仕様は公式資料・ローカル文書（~/.gemini/antigravity/builtin/skills/agy-customizations/docs/hooks.md）・バイナリの文字列で調査（調査は3つのサブエージェントに分担、モデル呼出しなし）。既存のT112のorchestration（roles.json、Ajv）を再利用。
- 新規: `schemas/`（common、task、routing-decision、execution、usage、evaluation、approval）、`orchestration/model-registry/{models.json,routing-policy.json}`、`orchestration/router/router.ts`、`orchestration/gateway/{config,schema,approval,gateway,doctor,agentctl}.ts`、`orchestration/telemetry/{db,normalize,monitor}.ts`、`orchestration/adapters/{types,claude,codex,antigravity,gemini-api,local,mock-cli}.ts`、`orchestration/optimizer/optimizer.ts`、`orchestration/hooks/{hook,detect,child}.ts`、`orchestration/tests/`（helpers と8テストファイル）、`orchestration/agentctl.tsconfig.json`、`scripts/agentctl`、`scripts/agentctl-hook`、`.claude/settings.json`、`.codex/hooks.json`、`.agents/hooks.json`、`.agents/skills/{model-router,token-monitor,routing-optimizer}/SKILL.md`、`.claude/skills/{同}/SKILL.md`（入口）、`data/README.md`、`docs/agent-routing/{architecture,setup,operations,troubleshooting,verification-report}.md`、`docs/agent-routing/pending-hook-fixes.patch`、`tickets/T121.md`。
- 変更: `AGENTS.md`（モデル選択・計測・改善の規約を1項目追加）、`CLAUDE.md`（入口の説明を1段落追加）、`.gitignore`（`/data/*` を除外、`data/README.md` は対象）、`docs/STATUS.md`（先頭に再開地点）。
- リポジトリ外: `~/.config/agentctl/approval.key`（`agentctl init`、権限0600）。実行時データ `data/telemetry.db` ほか（Git管理外）。Git管理外の `work/agentctl-smoke/`（実機確認用のタスクファイル）。
- 実機で発見したHook判定の不具合3件のうち2件の修正パッチを、一時コピーで作成・検証して `docs/agent-routing/pending-hook-fixes.patch` に保存（未適用）。

## 判断と理由
- 計測DBはNode内蔵の `node:sqlite` を使い、新しい依存を増やさない。Schema検査はT112と同じ固定版Ajvを再利用。
- 承認は実行ID・判断ID・モデル・推論レベル・実行主体・期限に紐付けたHMACとし、鍵をリポジトリ外に置き、1回限り・DBの発行記録と照合。人の承認（従量課金）はTTYの対話確認と、Hookによる `agentctl approve` のAI実行拒否で、AIが作れない設計を優先した。同じOSユーザーのプロセスによる鍵の読み取りは防げないため、その限界を文書化した。
- Routerは実行中の親モデルを変えられない前提で、推奨の記録と、別CLI実行・サブエージェントへの委譲だけを行う。判断にLLMを使わない（llm_classifierは既定で無効）。
- 使用量の二重計上を防ぐため、製品ごとに内訳の包含関係を正規化し（Claudeの実トランスクリプトで thinking_tokens が出力の内数、Codexの実rolloutで total=input+output を確認）、dedupe_key・累積値の差分・メッセージID統合を実装。Antigravityは包含関係が非公開のため、total_tokensとの算術一致で判定し、合わなければestimatedにした（推測で補完しない）。
- Gatewayが起動したClaudeの子セッションでは、結果JSONのmodelUsageがサブエージェント込みのため、子セッションのHookでは使用量を取り込まない（included_in_parent）。
- Antigravityの PreToolUse は「判断なし」の返答がないため、通常の許可を緩めない `ask` を返す。編集ツールにはHookを掛けない（毎回の許可確認を避けるため。保護ファイルの改変は doctor の基準ハッシュで事後検知）。
- `docs/OPERATIONS.md` と大文字小文字だけ違う名前の衝突（macOS）を避けるため、文書は `docs/agent-routing/` に置いた。評価Schemaは動画の再現評価（orchestration/schemas/evaluation.schema.json）と別物であることを明記。
- Hook設定は、このセッション自身にも適用されると保護対象（Hook実装・設定）を編集できなくなるため、コードとテストを固めた後に最後に置いた。実際に即時に有効になったため、その後に見つけた不具合はHook実装を編集せず、検証済みパッチとして人の保守作業に回した（自分で作った保護を自分で迂回しない）。
- 購読枠を使う実モデル試験（codex exec、agy -p）は、指示書14章に従い承認を得ていないため実行しなかった。費用の発生しない確認（plan、L0、未ログインのClaudeの拒否、`agy -p "/hooks"`、引数エラーで止まるコマンドでの拒否確認）だけを実機で行った。
- Gitブランチは作成しなかった（コミットの依頼がなく、同じ作業ツリーを他のエージェントも使うため、HEADを切り替えない）。

## 検証コマンド・結果・証跡
- `node --test orchestration/tests/*.test.ts` → tests 59 / pass 59 / fail 0、exit 0（evidence/tests.txt）。内訳: router 8、approval 4、monitor 11、detect 6、gateway 12、hooks 10、optimizer 4、adapters 4。TEST-001〜015の対応は docs/agent-routing/verification-report.md 2章。
- `node node_modules/typescript/bin/tsc --noEmit -p orchestration/agentctl.tsconfig.json` → exit 0（evidence/typecheck.txt）。
- 修正パッチ適用後の一時コピーで `node --test orchestration/tests/*.test.ts` → tests 61 / pass 61（evidence/pending-patch-tests.txt）、型検査 exit 0、`git apply --check` 成功。
- 実機（このClaude Codeセッション）: Hook有効化後、`codex exec ...`・`claude ... -p`・`bash -c 'agy ...'`・承認鍵のcat・`sqlite3 data/telemetry.db "delete ..."`・`CLAUDE_CODE_SIMPLE=1 claude --bare ...` をBashで実行 → すべて `PreToolUse:Bash hook error: [agentctl] ...` で拒否。Editで `.codex/hooks.json` → 拒否。Agent(Explore, model=opus) → 拒否。Agent(Explore, モデル未指定) → haikuで実行、子の実行（completed、measured、65,998トークン、Hook発行の承認1件）を記録（evidence/real-claude-hooks.txt）。
- 実機（Antigravity）: `agy -p "/hooks"` → `.agents/hooks.json` の5イベントが有効と表示、exit 0（evidence/real-agy-hooks.txt）。
- 実機（Gateway、課金なし）: Codex向けタスクの plan → codex:gpt-6-luna、validation ok、used_llm false。動画解析の plan → antigravity:gemini-3.8-flash-medium。Claude指定の run → rejected（未ログインで候補なし）、exit 2。L0の run → completed、not_applicable（evidence/real-gateway-nocost.txt）。
- `./scripts/agentctl init` → 鍵0600・DB・基準ハッシュ作成。`./scripts/agentctl doctor --audit --since 2026-10-10T00:00:00Z` → fail 0、warn 4（Claude CLI未ログイン、GEMINI_API_KEY未設定、Codexのプロジェクト・Hook未信頼）、監査でHook導入前のClaude 6・Codex 6セッションとこのセッションの未計測分を検知（evidence/doctor-audit.json）。
- 既存機能の回帰: `./scripts/run --test tests/*.test.ts` 191件合格、ルートの型検査 exit 0、T112の `orchestration/contracts.test.ts`・`workflow.test.ts` 合格（evidence/regression.txt）。
- Skillの試用: `./scripts/agentctl status <子の実行ID> --require-metered` → exit 0、`agentctl usage --by model` で集計（evidence/skill-trial.txt）。

## 未実施・制約
- Codexの実セッションでのHook動作（利用者がプロジェクトとHookを信頼するまで読み込まれない仕様。エージェントはユーザー設定の信頼を変更しない）。
- Antigravityの実セッション（対話・-p・サブエージェント）でのHook動作。Hookの読込みだけ確認。
- Gatewayからの実モデル実行（codex exec、agy -p は購読枠を使うため未承認、claude -p はCLI未ログイン）。Gemini APIはキー未設定・方針で無効のため模擬のみ。
- Claude CodeのUserPromptSubmitは、Hook導入後に利用者の発言がまだないため実機未観測。そのため実機のサブエージェント実行の親実行IDは空。
- コスト削減の実測なし（実績データなし）。
- Hook判定の不具合3件（リダイレクト誤判定、CodexのPMの操作の拒否、本文中の鍵パス文字列の誤判定）。前2件は修正パッチ未適用、3件目は未修正。
- 強制できない経路（--bare、--safe-mode、Codexの未信頼・--disable hooks、人の端末、難読化・スクリプト内呼出し、同ユーザーによる鍵の読み取り等）は architecture.md 7章。
- 定型作業の評価（routine-to-skill）: 今回新規作成した3 Skill（model-router、token-monitor、routing-optimizer）は依頼された成果物そのもので、試用済み（evidence/skill-trial.txt）。それ以外の候補（課金なしでCLIのHookを実機確認する手順、Hook導入時は保護対象の編集を終えてから有効化する順序）は今回1回だけで反復の根拠がないため、Skill化を見送り、手順は setup.md と本ログに残した。

## TODO・再開方法
1. 人: `git apply docs/agent-routing/pending-hook-fixes.patch` → `node --test orchestration/tests/*.test.ts`（61件）→ `./scripts/agentctl init`（基準ハッシュ更新）。新しい作業回で記録する。
2. 人: Codexでこのフォルダを信頼し、`/hooks` で7件を信頼 → `./scripts/agentctl doctor` で hooks_codex_* が ok。
3. 人: 購読枠を使う実機試験の可否を判断。可なら新しい作業回で、最小のプロンプトのタスクを `./scripts/agentctl run`（Codex: gpt-6-luna、Antigravity: gemini-3.8-flash-low/medium）で各1回実行し、子セッションのHook照合（child_session_verified）・使用量・モデル照合を確認して verification-report.md に追記。Claudeは `claude auth login` の後。
4. 利用者の次の発言でClaude CodeのUserPromptSubmitが記録されることを `./scripts/agentctl status` で確認。
5. Antigravityで run_command に ask を返す運用の影響を確認し、方針を決める。
