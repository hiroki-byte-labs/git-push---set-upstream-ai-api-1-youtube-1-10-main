# モデルルーティング・トークン計測の構成（T121）

Codex・Claude Code・Antigravityのどこから作業を始めても、管理対象のエージェント実行に共通のモデル選択と計測を適用するための仕組み。実装は `orchestration/` 配下、データ契約は `schemas/`、実行時データは `data/`（Git管理外）。

## 1. 全体像

```
 共通ルール（第1段階）   AGENTS.md / CLAUDE.md / .agents/skills/{model-router,token-monitor,routing-optimizer}
        │
 各製品のHook（第2段階） .claude/settings.json ─┐
                         .codex/hooks.json  ────┼─ scripts/agentctl-hook → orchestration/hooks/hook.ts
                         .agents/hooks.json ────┘     （判定 detect.ts、子セッション照合 child.ts）
        │
 Gateway（第3段階）      scripts/agentctl → orchestration/gateway/agentctl.ts
                         gateway.ts（受付→Router→判断の検証→承認→実行→計測→成果物検証→状態更新）
                         router/router.ts      ルールベースのModel Router（LLM不使用）
                         adapters/*.ts         claude -p / codex exec / agy -p / Gemini API / L0プログラム / 模擬CLI
                         telemetry/*.ts        正規化・冪等記録・集計（SQLite: data/telemetry.db）
                         optimizer/optimizer.ts 費用対効果の分析・提案・PM確認・適用・復元
                         model-registry/       models.json（実環境で確認したモデル）、routing-policy.json（規則・版つき）
```

- **管理対象の実行**: (1) `agentctl run` で起動する別モデル・別製品の実行、(2) 各製品の中で起動するサブエージェント、(3) Hookが動いている対話セッション（観測・推奨の記録）。
- **管理外**: Hookが読み込まれない起動（後述）、人が自分の端末で直接起動したCLIの「中身」の強制。人の起動もHookが読み込まれれば観測・推奨・Bash/サブエージェント制御の対象になる。

## 2. データ契約（schemas/）

| ファイル | 内容 |
|---|---|
| common.schema.json | ID形式（tsk_/exe_/rdc_/use_/evl_/apr_）、製品・難易度・tier・状態などの列挙 |
| task.schema.json | Gatewayへの入力。プロンプト本文は持たず `input.prompt_file` のパスだけ |
| routing-decision.schema.json | 選択結果、候補と除外理由、検査、推定、エスカレーション元、使用したルール、LLM使用の有無 |
| execution.schema.json | 1実行の記録（task_id、parent_task_id、execution_id、initiator、agent_name、provider、model_id、reasoning_level、task_type、difficulty、routing_reason、status、start/end、duration_ms、retry_count、artifacts、test_results ほか） |
| usage.schema.json | 正規化した使用量と取得方法（measured / estimated / unavailable）、費用の種別 |
| evaluation.schema.json | 実行の品質評価（試験・人・独立レビュー）。動画の再現評価 `orchestration/schemas/evaluation.schema.json` とは別物 |
| approval.schema.json | 実行承認の本体 |

取得できない値はnull。全製品で同じJSONを使う。

## 3. Model Router

- 難易度: 明示 > プログラム指定ならL0 > エージェント名（`routing-policy.json` の `agents`）> タスク種別の既定 > 既定L2（`difficulty_source=default`）。対話のプロンプトは正規表現の規則（`prompt_rules` / `prompt_bumps`）で分類し、本文は保存しない。
- tier: L0=なし（LLMを使わない）、L1=light、L2=standard、L3=品質要求high以上ならhigh・それ以外はstandard（能力不足時だけ上位へ）、L4=high＋別製品の独立レビュー。品質要求の下限（`quality_floor`）より下げない。改善で承認された上書き（`overrides`）があればそれを使う。
- 製品の順序: タスク種別の `providers`（2026-10-17から、分析/要約はAntigravity、実装/設計/レビューはClaude、全体調整はCodex優先。詳細は [委譲と配分](DELEGATION-DISTRIBUTION.md)。`initiator` は起動元を表すが、通常の委譲先の先頭には置かない）。各モデルを、選択可能・能力・認証経路・API課金の可否・予算・トークン上限で検査し、指定tierから上位へだけ探す。候補ごとの除外理由を判断に残す。
- 失敗時（`nextAction`）: 能力・品質不足は1段上へ（上限 `max_escalations`=1）、一時的な失敗は同じモデルで再試行（上限 `max_retries`=2）、認証・予算・方針・入力・ツール・モデル不一致・不明は停止。
- 判断が難しい場合のLLM分類（`llm_classifier`）は既定で無効。

モデルIDは実環境で確認したものだけを登録した（`models.json` の `source` に確認方法と日付）。

| 製品 | light | standard | high | 確認方法 |
|---|---|---|---|---|
| Codex（ChatGPT購読） | gpt-6-luna | gpt-6.1-sol | gpt-6-astra | `codex debug models`（説明文） |
| Claude Code | claude-haiku-5-5（haiku） | claude-sonnet-5-5（sonnet） | claude-opus-5-5（opus） | Claude APIの公式モデル表・Agentツールの列挙。fable-5-1は高価なため自動選択外 |
| Antigravity（Googleアカウント） | gemini-3.8-flash-low | gemini-3.8-flash-medium | gemini-3.1-pro-high | `agy models`。tierは製品名からの初期値でベンチマークではない |
| Gemini API（従量課金） | gemini-3.5-flash-lite | gemini-3.8-flash | — | config/pricing.json（2026-10-08）。キー未設定・方針で無効 |

## 4. Execution Gatewayと承認

1. タスクをSchemaで検査し、task_id・execution_idを発行。起動元の製品を環境変数から推定し、申告と違えば記録する。
2. 計測が無効（`AGENTCTL_TELEMETRY=off`）、入れ子の深さが上限（`AGENTCTL_DEPTH`≥3）なら開始しない。
3. Routerの判断を保存（`data/runs/<task>/<exe>/routing-decision.json` とDB）。
4. 判断を検証: Schema、登録簿に存在し選択可能、tier一致、判断時と方針ファイルのSHA-256が同一、認証経路あり、品質の下限。従量課金は人の承認（`agentctl approve`、TTYの対話確認つき）が必要で、なければ `awaiting_human_approval` で止まる。
5. 承認を発行: 実行ID・判断ID・タスクID・製品・モデル・推論レベル・実行主体・有効期限（既定900秒）・乱数に、リポジトリ外の鍵（`~/.config/agentctl/approval.key`、0600）でHMAC-SHA256署名。DBには発行記録（トークンのハッシュ）。
6. 起動直前に承認を検証して消費（1回限り）。署名・期限・DBの発行記録・実行ID・モデル・推論レベル・実行主体のどれかが合わなければ拒否（Fail Closed）。
7. 子プロセスへ `AGENTCTL_EXECUTION_ID`・`AGENTCTL_APPROVAL`・`AGENTCTL_DEPTH` を渡す。購読認証ではAPIキーの環境変数（ANTHROPIC_API_KEY、OPENAI_API_KEY、CODEX_API_KEY、GEMINI_API_KEY 等）を除去し、勝手に従量課金へ切り替わらないようにする。
8. 子セッションのHookは `AGENTCTL_APPROVAL` を検証し、製品が通知する実モデルと承認モデルを照合する（違えば最初のプロンプトを止め、ツールを拒否）。結果側でも、Claudeは `modelUsage` のモデル名、Codexはrolloutの `turn_context.model`、Gemini APIは `modelVersion` で照合し、違えば `model_mismatch` で失敗にする。Antigravityの結果JSONにはモデルIDがないため、子セッションHookの `modelName` だけで照合する。
9. 使用量の記録（失敗した実行も）→ 成果物（`expected_artifacts`）と試験（`test_command`）→ 自動評価 → 状態。監査対象（`audit: true`）で計測が `missing` / `unavailable` なら `unmetered` とし、完了扱いにしない。
10. 失敗なら Router の `nextAction` に従って再試行・上位切替え・停止（各回が新しい実行IDと承認）。

**承認をAIが作れないようにする工夫と限界**: 鍵はリポジトリ外にあり、Hookが鍵の読み取り・計測DBの変更・`agentctl approve`／`optimize review|apply|rollback` のAIからの実行を拒否する。承認は1回限りでDBの発行記録と照合する。ただし同じOSユーザーで動くプロセスは鍵ファイルを読めるため、Hookを通らない経路（スクリプトからの読み取り等）で偽造される可能性は残る。完全な分離には別ユーザー・別マシンで鍵を持つ署名サービスが必要（未実装）。

## 5. Token Monitor（計測）

正規化（`telemetry/normalize.ts`）: `input_total` は全入力（キャッシュ読み書きを含む）、`cache_read`・`cache_write` はその内数、`output_total` は全出力（推論を含む）、`reasoning` はその内数、`total = input_total + output_total`。

| 取得元 | 入力とキャッシュ | 出力と推論 | 重複・累積の扱い |
|---|---|---|---|
| Claude `-p` 結果JSON `modelUsage` | inputTokensはキャッシュを含まない→足す | outputは思考を含む。思考の内数は返らない（unavailable） | `claude:result:<session>:<model>`。サブエージェント込み |
| Claudeトランスクリプト `message.usage` | 同上 | `output_tokens_details.thinking_tokens` が内数 | 同じmessage.idの複数行を1件に。後から増えた出力は加算せず大きい値へ更新。メインではサイドチェーンを除外 |
| Codex rollout `token_usage_record` | input_tokensはcachedを含む（total=input+outputで確認） | outputは推論を含む | 応答ID単位 `codex:resp:<thread>:<response>`。子スレッドは別ファイル |
| Codex `exec --json` `turn.completed.usage` | 同上 | 同上 | スレッド累積値→前回値との差分（rolloutがあればそちらを優先） |
| `agy -p` JSON `usage` | 包含関係が非公開→`total_tokens` と算術一致で判定、合わなければestimated | thinking_tokensを出力に含めて記録 | `agy:conv:<id>:result` |
| Gemini API `usageMetadata` | promptはcachedを含む | thoughtsはcandidatesと別→足す | 応答ID単位 |

- 費用: `api_equivalent_usd` は登録簿の単価からの推定（購読枠の実請求額ではない。単価未確認のモデルはnull）。`provider_reported_usd` はClaudeの `total_cost_usd`（クライアント側推定）。`actual_billed_usd` は取得手段がないため常にnull/unavailable。`billing_mode` で購読とAPI課金を分ける。
- 計測状態: 入力・出力の合計が実測ならmeasured、推定を含めばpartial、取得不能はunavailable、記録なしはmissing、L0はnot_applicable、Gatewayが起動したClaude子セッション内のサブエージェントは親の `modelUsage` に含まれるため `included_in_parent`（二重計上しない）。
- 冪等性: `usage.dedupe_key` が一意。同じ結果の再送は計上しない。累積値は `cumulative_snapshots` との差分。
- 保存しないもの: プロンプト本文（タスクはSHA-256と文字数だけ）、APIキー、認証情報、動画・応答の内容（応答は `data/runs/` の出力ファイルにだけ残る）。

## 6. 各製品のHook

| 項目 | Claude Code 2.1.293 | Codex CLI 0.162.1 / デスクトップ同梱 0.162.0-alpha.2 | Antigravity CLI 1.3.3 |
|---|---|---|---|
| 設定 | `.claude/settings.json`（プロジェクト） | `.codex/hooks.json`（プロジェクト） | `.agents/hooks.json`（ワークスペース） |
| 読み込み条件 | なし（`-p`でも読む）。このセッションで即時反映を確認 | プロジェクトの信頼＋Hookごとの信頼（利用者の `~/.codex/config.toml` にだけ保存。リポジトリからは信頼できない） | フォルダの信頼。`agy -p "/hooks"` で読み込みを確認済み |
| 使うイベント | SessionStart、UserPromptSubmit、PreToolUse（Bash/Agent/Task/Edit/Write/MultiEdit/NotebookEdit/Read）、PostToolUse（Agent/Task）、SubagentStart/Stop、Stop | 同左（PreToolUseはBash/apply_patch/Edit/Write/spawn_agent/Agent） | PreInvocation、PreToolUse（run_command/invoke_subagent/define_subagent）、PostToolUse、PostInvocation、Stop |
| 拒否の方法 | `permissionDecision: deny` | 同左（JSON、終了コード0） | `decision: deny` |
| サブエージェントのモデル | 能力 enforced（2.1.293で確認）: 未指定なら `updatedInput` でRouterのモデル（haiku/sonnet/opus）を入れる。違う指定は拒否 | 能力 enforced（CLI 0.162.1とデスクトップ同梱0.162.0-alpha.2で確認）: 未指定なら `model` だけを入れる（`collaborationspawn_agent`）。違う指定は拒否 | 能力 unsupported（1.3.3）: 子は親（または定義）のモデルで動くため、推奨と同じなら許可、違えば拒否して `agentctl run` へ案内 |
| 子の使用量 | measured（エージェントのトランスクリプト） | measured（子スレッドのrollout） | measured（子の会話の transcript.jsonl。Gateway経由は子のHook、対話中は親のStopで親の会話記録にある子の会話IDから結び付ける。子の `ANTIGRAVITY_CONVERSATION_ID` は子自身のIDで親を示さない。2026-10-12 実データで確認） |
| 子の識別 | SubagentStartの `agent_id` を事前に作った子の実行へ結び付け、SubagentStopの `agent_transcript_path` から使用量 | 同左（`agent_transcript_path` はrollout） | 子の実行を記録。使用量はHookに出ない |
| 失敗時の扱い | 終了コード1は非ブロック | 0/2以外・タイムアウトは素通り（fail open） | 未公開 |
| 判定に迷う操作の返答 | 何も返さない（通常の許可処理） | 同左 | `decision: allow`（「判断なし」の値がないため。2026-10-11に利用者の指示で `ask` から変更。拒否しない操作は確認なしで実行される） |
| 協調ツールの名前 | `Agent` | `collaborationspawn_agent`（名前空間＋名前、区切りなし。0.161で実機確認） | `invoke_subagent` |

Hookの処理は軽量（Node起動＋SQLite、LLM不使用）。Hookから別のAIを呼ばないため再帰しない。Gatewayの子には `AGENTCTL_DEPTH` を渡し、深さ3以上は拒否する。Claudeの対話セッション開始時に `CLAUDE_ENV_FILE` へ `AGENTCTL_PARENT_SESSION` を書き、そのBashから起動された別CLIのセッションを「入れ子の未承認実行」として止める（Codex・Antigravityは各製品の環境変数 `CODEX_THREAD_ID`・`ANTIGRAVITY_CONVERSATION_ID` で判定。付与の有無は実機未確認）。

### 製品内サブエージェントの能力（models.json の `providers.<製品>.native_subagents`）
`model_override`（enforced=モデルを指定でき実機で確認済み / unverified=指定の引数はあるが未確認 / unsupported=指定できない）、`model_param`、`child_usage`（measured / included_in_parent / unavailable）、`verified_version`・`verified_app_version`（Codexデスクトップ同梱版だけ）・`verified_at`・`basis`。Hookはこの能力で判断し、unverifiedの製品では子が別のモデルで起動しても止めずに `subagent_model_not_applied` を記録する（確認材料にする）。`agentctl doctor` は各製品の現在のCLI版を `verified_version`、Codexデスクトップアプリの同梱版を `verified_app_version` と比べ、前回のdoctorの記録からの変化も警告する。版が変わったら、能力（Hookへのツール名・引数、子のモデル、子の使用量）を各1回の実機試験で確認し直し、保守作業で `models.json` を更新する。

## 7. 強制が成立する範囲・しない経路

| 経路 | 状態 | 理由・補足 |
|---|---|---|
| `agentctl run` による実行 | 強制（実装・試験済み） | 承認なし・モデル相違・計測無効・深さ超過は拒否。結果側のモデル照合も |
| Claude Codeの対話・`-p`（Hook読込み時）からのAI CLI直接起動・AI APIへのcurl | 強制（このセッションで実機確認） | PreToolUse(Bash)で拒否 |
| Claude Codeのサブエージェントのモデル | 強制（実機確認） | 未指定→haiku注入、opus指定→拒否、子の使用量を記録 |
| Codexの対話・exec（Hook信頼後） | 強制（模擬入力に加え、SessionStart・UserPromptSubmit・子セッションの承認照合・native subagentのモデル注入と計測を実機確認。native subagentはCLI 0.162.1とデスクトップ同梱0.162.0-alpha.2で確認） | 利用者の信頼操作が前提。Hookの失敗は素通り（fail open） |
| Antigravityの対話・`-p`（フォルダ信頼時） | 強制（模擬入力で試験。実機ではGateway経由の `-p` の子セッションでPreInvocationの発火と承認照合を確認、対話・拒否・サブエージェントは実機未確認） | サブエージェントのモデルは記録のみ |
| `claude --bare` / `--safe-mode` / `--setting-sources user` / `--settings '{"disableAllHooks":true}'` | 強制できない | 起動側の指定でプロジェクトHookが読まれない。AIのBashからの起動はHookで拒否、人の端末からの起動は止められない。管理設定（allowManagedHooksOnly）が必要 |
| Codexの未信頼プロジェクト、`--disable hooks`、`--dangerously-bypass-hook-trust`、`features.hooks=false` | 強制できない | 同上。`/etc/codex/requirements.toml` の管理Hookが必要 |
| 人が自分の端末で起動したCLI・アプリ（Codexデスクトップ、Antigravity IDE等）の中身 | 部分的 | Hookが読まれればBash・サブエージェントは制御・記録される。モデル自体の選択は止められない（推奨を記録） |
| 文字列の難読化（base64→sh、eval変数）、スクリプトファイル内のAI CLI・SDK呼出し、Python等からの書込み | 検知できない／事後検知 | コマンド文字列の判定の限界。入れ子セッションのHookと `doctor --audit` で補う |
| Codex内部の子エージェント（レビュー等）・ホスト側ツール（WebSearch） | 強制できない | Codex Hookの対象外 |
| Antigravityの対話セッションの使用量 | 取得できない | Hook・トランスクリプトに使用量がない（unavailableで記録） |

**迂回の検知**: `agentctl doctor --audit` が、Claudeのトランスクリプト（`~/.claude/projects/<リポジトリ>/`）とCodexのrollout（`~/.codex/sessions/`、作業ディレクトリがこのリポジトリのもの）を読み、DBで観測していないセッションや使用量の不足を報告する（本文は読まない）。Hook設定・判定コード・ルーティング設定のハッシュを基準と比べて改変も報告する。

## 8. Routing Optimizer

タスクごとに「最初に選ばれたモデル」を戦略とし、そのタスクの全実行（失敗・再試行・上位切替えを含む）の費用・トークンを合計、最終実行の品質評価が合格したタスク数で割る（合格1件当たりの総コスト）。評価済みタスクが基準数（20）未満の戦略は比べない。製品をまたいで単価が揃わなければ提案しない。提案は `data/optimizer/` に保存し、適用はPM（Codex）または人の確認後だけ。適用時に旧版を `data/policy-history/` に保存し `policy_changes` に記録、`optimize check` で合格率の低下を検知して復元できる。

## 9. 計測DB（data/telemetry.db）

tasks、decisions、approvals、human_approvals、executions、usage、cumulative_snapshots、evaluations、sessions、events、proposals、policy_changes、meta。WALモードで複数製品のHookから同時に書ける。スキーマは `orchestration/telemetry/db.ts`。
