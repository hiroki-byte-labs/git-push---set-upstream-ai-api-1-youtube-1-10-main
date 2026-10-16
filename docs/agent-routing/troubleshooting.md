# トラブル対応（agentctl、T121）

| 症状 | 原因 | 対処 |
|---|---|---|
| `[agentctl] codex の直接起動（agentctl run を通していない）` | AI CLIをBash等から直接起動した | `scripts/agentctl run --task` を使う。参照系（`--version`、`codex debug models`、`agy models`、`agy -p "/hooks"` 等）は許可される |
| 参照系のコマンドなのに拒否される（例: `agy -p "/hooks" > out.txt`） | リダイレクトの誤判定（2026-10-11に修正パッチ適用済み。未適用の複製では発生） | `docs/agent-routing/pending-hook-fixes.patch` が適用されているか確認（`grep stripRedirects orchestration/hooks/detect.ts`） |
| 文章を書くだけのコマンドが `承認鍵へのアクセスは禁止` で拒否される | 既知の不具合: コマンド本文に承認鍵のパス文字列があると判定される（ヒアドキュメント等） | 書き込む内容をファイルに置き、そのファイルを指定して実行する |
| `Model Routerの選択は claude-haiku-5-5（model: "haiku"）` で拒否 | サブエージェントに方針と違うモデルを指定した | 表示されたモデルで起動し直す。上位が必要なら難易度・品質要求を付けて `agentctl run` |
| `未承認の入れ子実行（親 claude:...）` でプロンプトが止まる | エージェントのBashから別のCLIセッションを起動した | `agentctl run` で起動する（承認つきの子は通る） |
| `承認情報と実行内容が異なります` / `署名が一致しません` / `使用済み` | 承認の偽造・再利用・モデルの差し替え | 正規の `agentctl run` からやり直す。繰り返す場合は `agentctl doctor` とイベント（events）を確認 |
| 終了コード2 `判断後にルーティング方針が変更された` | 判断と実行の間に `routing-policy.json` が変わった | もう一度 `agentctl run` |
| 終了コード2 `条件を満たすモデルがありません` | 認証経路がない（例: Claude CLI未ログイン）、能力不足、予算・トークン上限 | `agentctl plan` の `candidates[].reasons` を読む。Claudeなら `claude auth login` |
| 終了コード3 | 従量課金で人の承認待ち | 運用手順5章 |
| 終了コード4 `計測なし` | 製品が使用量を出さなかった（Antigravityの対話、CLIのエラー等）か、出力の解析に失敗 | `data/runs/<task>/<exe>/stdout.txt` を確認。正常完了として報告しない |
| `Token Monitorが無効` | `AGENTCTL_TELEMETRY=off` が設定されている | 解除する（監査対象は計測なしで実行しない） |
| `承認鍵がありません` / `権限が広すぎます` | `agentctl init` 未実施、鍵の権限変更 | `./scripts/agentctl init`。鍵は0600 |
| Codexで拒否されない・記録されない | プロジェクトまたはHookが未信頼、`--disable hooks` | `agentctl doctor` の `hooks_codex_*` を見て setup.md 4章 |
| Antigravityでコマンドが確認なしで実行される | 2026-10-11に利用者の指示で、Hookが拒否しない操作には `allow` を返す設定にした | 確認を求めたい場合は、人が保守作業で `orchestration/hooks/hook.ts` の `pass` を `ask` に戻す |
| Codexで変更したHookが効かない | `.codex/hooks.json` を変更した後、Codexで再信頼していない（Codexは変更されたHookを読み飛ばす） | `agentctl doctor` の `hooks_codex_retrust` を確認し、Codexの `/hooks` で再信頼 |
| Codexのサブエージェントが「管理外の子」（unmanaged_subagent）になる | 協調ツール名 `collaborationspawn_agent` を判定式が認識していなかった（2026-10-11のパッチ3で解消）。または変更したHookが未再信頼 | `grep "spawn_agent\$" orchestration/hooks/hook.ts`、`agentctl doctor` の `hooks_codex_retrust` |
| Antigravityのサブエージェントが「親のモデル … で動く。推奨は …」で拒否される | Antigravityは子のモデルを指定できないため、推奨が親のモデルと違う子は許可しない（方針②） | 拒否理由の task_type・難易度でタスクを作り `agentctl run` に任せる |
| `doctor` の `version_*` が warn | 製品の版が能力を確認した版（models.json の `verified_version`）から変わった | 各製品で1回だけ実機試験を行い、Hookへのツール名・引数、子のモデル、子の使用量を確かめ、保守作業で models.json を更新（architecture.md 6章） |
| Antigravityが「認証済みの実行経路なし」で選ばれない | 以前はトークンファイルの有無で判定していた（Antigravityの更新で無くなった）。2026-10-11から `agy models` の成功で判定 | `agy models` が一覧を返すか確認。`data/auth-agy.json`（10分キャッシュ）を消して再判定 |
| Codexの中から `agentctl run` で `codex exec` が `Operation not permitted` で失敗 | Codexのサンドボックス内ではapp-serverを初期化できない | Gatewayから別製品を起動する作業はサンドボックス外（人の端末、Claude CodeのBash等）で行う |
| Hookのエラー `database is locked` | 複数製品のHookの同時書込み（2026-10-11に1回、原因は再現できず） | 待機時間を先に設定する修正済み。続く場合は `data/hook-errors.log` を確認 |
| Hookのエラー（`data/hook-errors.log`） | Node未検出、DBロック、設定の破損 | `NODE_BIN` を設定、`agentctl doctor`。AI起動・サブエージェント起動の判定ではエラー時に拒否、それ以外は妨げない |
| `doctor --audit` に古いセッションが出る | Hook導入前のセッション | `--since <導入日時>` を付ける（既定は `agentctl init` の日時） |
| テストが実際のdata/を書き換えた | `AGENTCTL_DATA_DIR` 等を設定せずにHookを手で起動した | テストは `orchestration/tests/helpers.ts` の一時ディレクトリを使う。手で試すときは `AGENTCTL_DATA_DIR`・`AGENTCTL_KEY_DIR` を一時ディレクトリにする |
