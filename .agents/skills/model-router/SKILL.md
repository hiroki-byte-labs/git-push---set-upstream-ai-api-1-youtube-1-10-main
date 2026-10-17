---
name: model-router
description: このリポジトリで別のAIモデル・別製品（Codex / Claude Code / Antigravity / Gemini API）へ作業を任せる前、またはサブエージェントを起動する前に、タスクの難易度（L0〜L4）と品質要求から実行モデルを決め、agentctl経由で承認つきの実行にする。「別モデルに任せたい」「サブエージェントを使う」「どのモデルで実行するか」と判断するときに使う。今実行中の自分のモデルを切り替える用途には使えない。
---
# Model Router（モデル選択）

正本は `orchestration/router/router.ts`（ルール）と `orchestration/model-registry/`（登録簿 `models.json`・方針 `routing-policy.json`）。この文書は使い方だけを書く。仕組みは docs/agent-routing/architecture.md。

## 前提
- **推奨表示と委譲の実行は別**。Skillを読む、Hookに推奨が出る、`plan`を実行するだけでは他製品は動かない。親が `agentctl run` に具体的な子作業を渡す必要がある。現在の親モデルの消費は続き、消費比率の均等化は保証しない。
- 選択はルールベースで、LLMを呼ばない。実行中の親モデルは変えられない。選んだモデルへは「別のCLI/API実行（agentctl run）」か「製品内サブエージェント」で委譲する。
- AI CLI（`claude -p`、`codex exec`、`agy -p`、`gemini`、AI APIへのcurl）の直接起動は各製品のHookが拒否する。必ず `scripts/agentctl` を使う。
- 難易度: L0=プログラムだけ（LLMなし）、L1=抽出・分類・要約（軽量）、L2=通常の分析・実装（標準）、L3=複雑（品質要求high以上なら高性能、それ以外は標準で開始し能力不足時だけ上位へ）、L4=重大判断（高性能＋別製品の独立レビュー）。

## 手順
0. 利用者が分担・委譲を許可している場合、実装/調査/レビューを独立して確認できる単位へ切り出し、親は指示・統合・最終検証を担当する。小さな単発操作や切り出すとかえって重複する作業は親で進め、その理由を記録する。他製品へ配るには製品内サブエージェントではなく `agentctl run` を使う。既に許可された購読枠の実行で毎回確認を取り直さない。
1. タスクファイルを作る（形式は `schemas/task.schema.json`）。プロンプト本文はファイルに置き、`input.prompt_file` でパスだけ渡す。迷う難易度は `difficulty: null` にすると規則（エージェント名→種別→既定L2）で決まる。
   - `parent_task_id` に親の管理IDを入れる。必要な目的・入力・制約・担当ファイル/出力・完了確認だけを渡し、全会話や無関係なログを複製しない。`preferred_provider` は通常nullとし、役割別の方針に選択させる。
   - 書込みを任せる場合は所有範囲を限定し、他者の変更を戻させない。親が作業ログを保持していることを伝え、子に別のstart/finishや他者の終了をさせない。同じファイルを同時編集しない。
2. 選択だけ確認する: `scripts/agentctl plan --task task.json`（実行しない・課金しない）。`decision.selected` と `routing_reason`、`validation` を読む。
3. 実行する: `scripts/agentctl run --task task.json`。終了コード 0=完了、1=失敗、2=拒否、3=人の承認待ち、4=計測なし（正常完了ではない）。
   終了後は成果を親が確認し、`status <ID> --require-metered` で計測まで確認する。選択だけ成功した状態を「他エージェントへ配分した」と報告しない。実行できなければ認証・制限・モデル照合等の理由を記録し、同じ障害で無制限に再試行しない。
4. 失敗時の再試行・上位切替えはGatewayが方針の上限内（再試行2回・上位切替え1回）で自動に行う。能力・品質不足だけ上位へ、一時的な失敗は同じモデル、認証・予算・方針・入力・モデル不一致は停止。自分で別モデルを直接起動し直さない。
5. **別モデルや計測が必要な子作業は `agentctl run` で起動する**。製品内サブエージェントは、親と同じモデルで足り、子の使用量が取れなくてもよい作業にだけ使う。製品ごとの能力（モデル指定・子の使用量・確認した版）は `orchestration/model-registry/models.json` の `providers.<製品>.native_subagents` にある。
   - モデル指定ができる製品（Claude Code。Codexは確認中）: HookがRouterの選んだモデルを入力へ入れる（指定がない場合）か、違うモデルの指定を拒否する。拒否理由に出たモデル（Claude Codeは `haiku`/`sonnet`/`opus`）で起動し直す。
   - モデル指定ができない製品（Antigravity）: 子は親のモデルで動くため、Routerの推奨が親のモデルと同じときだけ許可され、違えば拒否される。拒否理由に出た `task_type`・難易度でタスクファイルを作り、`agentctl run` に任せる。

## 従量課金
`routing-policy.json` の `auth.allow_api_billing` は既定でfalse。有効化はPMと人の判断で、実行には人が端末で `scripts/agentctl approve <判断ID>` を行い、`scripts/agentctl run --resume <実行ID>` で再開する。AIが承認を作ることはできない（Hookとagentctlが拒否する）。

## 配分方針と実績の読み方

役割別の優先先は `orchestration/model-registry/routing-policy.json` が正本。2026-10-17の利用者の希望で起動元優先から変更した。経緯と制約は `docs/agent-routing/DELEGATION-DISTRIBUTION.md`。利用可能な購読認証・能力・品質tier・予算を満たす候補へフォールバックし、API課金を勝手に有効化しない。等分のトークン割当てや費用最小化が実証された設定ではない。

記録では `route=interactive`（本人が開いた親対話）と `route=cli, managed=true`（Gatewayの委譲）を分ける。親の推薦先と実際の実行製品も分け、未計測を0トークンとみなさない。起動件数・トークン数・キャッシュ・購読の使用率は別の指標として報告する。

## 保守（保護対象の変更）— 利用者への確認は不要（包括許可 2026-10-12）
Hook実装（`orchestration/hooks/*`）・Hook設定（`.claude/settings.json`、`.codex/hooks.json`、`.agents/hooks.json`）・`orchestration/model-registry/*.json`・`scripts/agentctl-hook` は、エージェントの編集ツールやシェルからの直接編集をHookが拒否する。迂回せず、次の手順で変更する（2026-10-11〜12に5回実施した手順）。
1. 一時領域（スクラッチパッド）へ `tar` で複製を2つ作る（a=変更前、b=変更後。`orchestration`・`schemas`・`scripts`・`.agents/agents`・`.claude/agents`・`.codex/agents`・`.codex/hooks.json`。node_modules はリンク）。`cp` の引数に保護対象のパスがあるとHookが拒否するので `tar` を使う。
2. b を修正するスクリプトはファイル編集ツールで書いてから実行する（ヒアドキュメントに承認鍵のパスを書くと拒否される）。試験も b に追加する。
3. b で `node --test orchestration/tests/*.test.ts` と `tsc -p orchestration/agentctl.tsconfig.json` を通し、`diff -ru` で a→b のパッチを作り、本体で `git apply --check` を通す。パッチは `docs/agent-routing/` に置く。
4. `./scripts/agentctl maintenance apply <patch>`。一時コピーでの全試験→本体へ適用→本体で全試験→Hook基準ハッシュの更新→計測DBへの記録（`maintenance_patch_applied`）まで自動で行い、失敗なら本体を変えない（適用後の試験が失敗したら逆適用で戻す）。
5. 結果（終了コード・JSON）を作業ログの証跡に保存する。`codex_retrust_required: true` のときだけ、利用者にCodexの `/hooks` での再信頼を依頼する（リポジトリからは信頼できない仕様）。
実機の確認（購読枠）が必要なら、必要最小のプロンプトで実行してよい（確認不要）。製品の版が変わったときの能力の再確認も同じ扱い。

## 新しいモデルを追加するとき
実環境の一覧（`codex debug models` / `agy models` / Claude Codeのモデル選択）と公式資料で確認したIDだけを `models.json` に追加し、`source` に確認方法と日付を書く。推測でIDを作らない。登録簿の変更はHookの保護対象なので、上の「保守」の手順（`agentctl maintenance apply`）で行い、作業ログを残す。
