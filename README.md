# 投資と心理 — ローカル動画制作サービス
> 2026-10-08のエンハンス（台本v2、安全検査、図解4種、字幕選択、媒体検査、確認画面、ジョブ管理）の全体像は [docs/HANDOFF.md](docs/HANDOFF.md) を参照。演出を追加するときは [docs/PRODUCTION-GUIDELINES.md](docs/PRODUCTION-GUIDELINES.md) に従う。

日本の投資初心者向け動画を段階的に自動制作する基盤。M0/M1では36秒の試作を、外部API・課金・YouTube認証なしで生成します。台本は固定、図解・字幕は自作、音声は自作確認音です。自然なナレーションと10〜20分の番組制作は後続段階です。

## 動作環境と準備
macOS、Swiftコンパイラ（Command Line Tools）、Node.js 24以上、Python 3/pip。描画はAppKit、変換はFFmpegを使用。Mac以外は未対応。起動はPATHのNode、または利用者が明示指定したNODE_BINを使用します。特定エージェント付属のランタイムは自動選択しません。実行時のnpm依存はありません。静的型検査には開発依存を使います。

```sh
# 初回だけ。無料のFFmpegバイナリをwork/へ取得（ネットワーク必要）
./scripts/setup-media
# python3にpipがなければ、pipを含むPythonを指定
PYTHON_BIN=/path/to/python3 ./scripts/setup-media
# 既にffmpeg（libx264/AAC対応）がPATHにあればsetupは不要

./scripts/run src/cli.ts check
./scripts/run --test tests/*.test.ts
./scripts/run src/cli.ts tickets
./scripts/run src/cli.ts next
./scripts/verify   # check・テスト・型検査を一括実行（コミット前）
```

## 動画生成と再生
```sh
./scripts/run src/cli.ts sample                                   # M1の36秒（v1台本）
./scripts/run src/cli.ts sample --plan fixtures/sample-v2.json    # v2台本（図解4種・48秒）
./scripts/run src/cli.ts lint --plan 台本.json                    # 安全検査だけ
./scripts/run src/cli.ts serve
```
ブラウザーで http://127.0.0.1:4173 を開くとジョブ一覧が出ます。詳細画面で再生、検査結果の確認、版に結び付く承認・差戻しができます（投稿はしません）。字幕の既定は切り替え式（soft）で、全文の焼き込みは `--subtitles burn|both` で選べます（T078）。ジョブ管理は `jobs` / `jobs clean`、確認の記録は `review` です（docs/OPERATIONS.md）。停止はCtrl+Cです。サーバーはローカルのみ。生成後の再生にインターネットは不要です。CLIは必ずリポジトリルートを使います（scripts/runが移動します）。npmを利用する環境では `npm run sample` なども使えます。

`outputs/<job-id>/sample.mp4` が完成動画。字幕は既定でMP4に切り替え式の字幕トラック（soft）として入り、別ファイル `subtitles.vtt` も作成します（`--subtitles burn` で焼き込み、`both` で両方）。`plan.json`、`job.json`、`lint.json`、`metadata.json`、`media-check.json`、サムネイル3案、全場面の確認画像も出力。`outputs/latest.json` は最後に正常完了したジョブを指します。2回実行しても既存出力は上書きせず新しいジョブになります。視聴する確認音は各場面の冒頭だけです。字幕を読み上げる機能はまだありません。

## チケット管理
正本は `tickets/Txxx.md`。テンプレートは `tickets/templates/TICKET.md`。`tickets` は担当・状態・優先度・段階・依存先、`next` は依存が完了したreadyを担当別に表示します。`check` はID重複、依存欠落、循環、必須項目、人向け手順、doneの依存状態を検証します。制作ジョブはチケットではありません。

## 再開と運用
まず [現在地](docs/STATUS.md)、[仕様](docs/SPEC.md)、[ロードマップ](docs/ROADMAP.md)、[検証記録](docs/VERIFICATION.md) を読み、`next` を実行してください。[復旧手順](docs/OPERATIONS.md)、[設計判断](docs/DECISIONS.md)、[素材台帳](docs/ASSETS.md) も参照。

秘密値はGitにも会話にも保存しません。.env.exampleは将来の設定名だけ。

実装の範囲（2026-10-10、詳細と最新は [docs/STATUS.md](docs/STATUS.md) の先頭）:
- **実装済み（ローカル）**: 確認画面での承認・差戻し。承認は確認対象一式（動画、採用タイトル・概要欄・タグ・チャプター、字幕、サムネイル全案）の版に結び付き、変更で失効します（T033、T095）。予算制御は見積り・上限（既定0 USD）・試行ごとの予約と精算・費用不明額の保持と再送判定・全試行の記録まで（T023、T024、T098）。ただし実接続がないため、費用は常にmock/localの0 USDです。
- **未接続・未実装**: 外部の実API（台本・音声・映像の生成）とYouTube投稿（Publisherは無効）。予算の永続化・ジョブをまたぐ管理・実サービスでの費用照合。無人運用（M5）。自然なナレーション（現在は確認音）。

静的型検査は導入済み。型除去は型検査ではありません。これまで契約・有料API・クラウド・push・YouTube操作は行っていません。

## AIエージェント向けの作業履歴
[logs/README.md](logs/README.md) に、ユーザーの指示、実装経緯、判断、検証、TODOの履歴を保存しています。記録者・モデル名を明記し、現在の状態はチケットを参照します。ログの仕組みはT009で導入しました。

## エージェント共通の完了検査
担当は `human / agent`。特定AIを優先せず、実施者名とモデルはログへ別に記録します。
初回は `./scripts/install-hooks` を実行し、[共通手順](docs/AGENT-WORKFLOW.md)に従って `src/worklog-cli.ts start` → 作業と記録 → `finish` → `src/cli.ts check` を実行してください。終了ログがない、未記入、終了後に変更がある場合はcheckとコミット前検査が失敗します。Gitのindexも検証します。

起動は通常のNode 24以上。PATHにないときは `NODE_BIN=/path/to/node ./scripts/run ...` と明示します。開発に使った端末でのNodeの場所は過去の作業ログとdocs/STATUS.mdの時点記録にありますが、自動選択はしません。共通管理CLIはNode/Gitで動き、動画生成だけがmacOS専用です。

## 定型作業のSkill化
共通原本は `.agents/skills/`。`routine-to-skill` が実績から候補を評価し、既存Skillの更新または新規作成・検証・試用を行います。最初の抽出例（T011）は `repository-task-closeout`（検証・チケット・ログの終了順序）です。どのAIもSKILL.mdを明示的に読んで使えます。自動検出の対応は実行環境ごとに異なります。

## 静的型検査
Node 24以上とpnpmで `pnpm install --frozen-lockfile`、`pnpm run typecheck` を実行します。npmの型検査コマンドも使用可能ですが、再現インストールの正本はpnpm-lock.yamlです。TypeScript 5.9.3と@types/node 24.10.0を固定し、srcとtestsをstrict/noEmitで検査します。型除去による実行と型検査は別です。直接実行は `./scripts/run node_modules/typescript/bin/tsc --noEmit`。
