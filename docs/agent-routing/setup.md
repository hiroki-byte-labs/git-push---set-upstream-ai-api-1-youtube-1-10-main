# 環境構築手順（agentctl、T121）

対象: macOS（Apple Silicon で確認）、Node.js 24以上（`node:sqlite` を使用。確認時はNode 26.11.1）、Git。有料APIの登録・キー発行はしない。

## 1. 依存の取得（初回・clone直後）
JSON Schemaの検査にT112と同じ固定版Ajvを使う。

```sh
pnpm --dir orchestration install --frozen-lockfile --ignore-scripts
```

## 2. 初期化
承認鍵（`~/.config/agentctl/approval.key`、権限0600、リポジトリ外）、計測DB（`data/telemetry.db`）、Hook設定の基準ハッシュ、認証経路の記録を作る。

```sh
./scripts/agentctl init
./scripts/agentctl doctor
```

`doctor` の `fail` を解消する。`warn` は下の各製品の手順で解消する（解消できない項目は検証レポートの「強制できない経路」に該当）。

## 3. Claude Code
- プロジェクトのHookは `.claude/settings.json` にあり、リポジトリのルートで起動したセッションで自動的に読まれる（実行中のセッションにも即時反映されることを確認）。
- Gatewayから `claude -p` で実行するには、スタンドアロンCLIのログインが必要（2026-10-11時点で未ログイン。デスクトップアプリのログインとは別）。**利用者の操作**: 端末で `claude auth login`（購読アカウントで）。APIキーでのログインは選ばない（従量課金になる）。
- 個人設定 `.claude/settings.local.json` や `~/.claude/settings.json` に `disableAllHooks: true` を書かない（doctorが検出する）。
- Claude Codeは `.agents/skills/` を自動では探さないため、`.claude/skills/<名前>/SKILL.md` に正本への入口を置いている。

## 4. Codex（利用者の操作が必要）
Codexは、プロジェクトの `.codex/` を**利用者が信頼したプロジェクトでだけ**読み、さらにHookを1件ずつ信頼する必要がある。信頼はユーザー設定（`~/.codex/config.toml`）にだけ保存され、リポジトリからは設定できない（エージェントが代行しない）。

1. このリポジトリで Codex（CLIまたはデスクトップアプリ）を開き、フォルダを信頼する（初回の確認画面、または `~/.codex/config.toml` に `[projects."<リポジトリの絶対パス>"]` と `trust_level = "trusted"`）。
2. Codexの対話画面で `/hooks` を開き、`.codex/hooks.json` の7件（SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、SubagentStart、SubagentStop、Stop）を確認して信頼する。Hookの内容を変えると再度の信頼が必要になる。
3. `./scripts/agentctl doctor` で `hooks_codex_project_trust` と `hooks_codex_hook_trust` が `ok` になることを確認する。
4. `CODEX_API_KEY` / `OPENAI_API_KEY` を環境に置かない（置くとCodex execがAPI課金を優先する。Gatewayは子プロセスから除去する）。`forced_login_method="chatgpt"` は `CODEX_API_KEY` がある状態で使うと保存済みログインを消すため、設定しない。

## 5. Antigravity
- `.agents/hooks.json` はフォルダを信頼したワークスペースで読まれる。確認（エージェントのターンを開始せず、クォータも使わない）:
  ```sh
  agy -p "/hooks"
  ```
  `agentctl enabled PreInvocation ...` など5行が出ればよい（2026-10-11に確認済み）。
- APIキー課金モード（`~/.gemini/antigravity-cli/settings.json` の `modelProvider`）にしない。購読枠を超えたときのAIクレジット消費（`useG1Credits`）は利用者の判断で無効にできる。

## 6. Gemini API（使わない場合は何もしない）
従量課金のため既定で無効（`routing-policy.json` の `auth.allow_api_billing: false`）。使うには、利用者がキーを発行して環境変数 `GEMINI_API_KEY` を設定し、PMと人が方針を変更し、実行ごとに人が `agentctl approve` で承認する。キーをファイルやチャットに貼らない。

## 7. 動作確認（課金なし）

```sh
node --test orchestration/tests/*.test.ts                         # 59件（模擬CLI・模擬Hook入力）
node node_modules/typescript/bin/tsc --noEmit -p orchestration/agentctl.tsconfig.json
./scripts/agentctl plan --task <task.json>                        # 選択だけ確認
./scripts/agentctl doctor --audit
```

## 8. 保護対象の変更（保守）
Hook設定・判定コード・ルーティング設定・登録簿は、各製品のHookがエージェントの直接編集を拒否する。変更は、一時コピーで検証したパッチを `./scripts/agentctl maintenance apply <patch>` で適用する（一時コピーでの全試験→本体へ適用→全試験→基準ハッシュ更新→記録。失敗なら本体は変わらない）。2026-10-12から利用者の包括許可により、エージェントが確認なしで行う（AGENTS.md、model-router Skill「保守」）。`.codex/hooks.json` を変えた場合だけ、利用者がCodexの `/hooks` で再信頼する。
人が直接編集したい場合は、保守モード（例: `AGENTCTL_MAINTENANCE=1 claude`）でセッションを起動する（承認鍵と計測DBは保守モードでも編集できない）。変更後は `./scripts/agentctl init` で基準ハッシュを更新する。
