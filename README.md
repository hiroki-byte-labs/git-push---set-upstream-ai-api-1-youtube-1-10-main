# 日常の知識を深掘りするローカル動画制作サービス
> T070の回答により、題材を投資と心理から日常に結び付く知識全般へ変更しました。[制作方針](docs/CHANNEL-POLICY.md)を参照。新テーマの台本（テーマ別免責・概要欄の導入文と出典）と無料サンプル `fixtures/sample-general.json` はT103で対応済み。本人の題材選定・考察・台本承認の工程（`produce`）はT104で実装済み。
> 2026-10-08のエンハンス（台本v2、安全検査、図解4種、字幕選択、媒体検査、確認画面、ジョブ管理）の全体像は [docs/HANDOFF.md](docs/HANDOFF.md) を参照。演出を追加するときは [docs/PRODUCTION-GUIDELINES.md](docs/PRODUCTION-GUIDELINES.md) に従う。

日常に結び付く知識を日本語の初学者へ説明する動画制作基盤。M0/M1の固定台本による36秒試作に加え、現在はPlan v2と本人の題材選定・考察・承認工程に対応しています。外部API・課金・YouTube認証なしで、図解・字幕・自作確認音のMP4を生成できます。自然なナレーションと実音声を伴う10〜20分の番組制作の受入れは未完了です。

## 動作環境と準備
macOS、Swiftコンパイラ（Command Line Tools）、Node.js 24以上、Python 3/pip。既定のnative描画はAppKit、変換はFFmpegを使用し、Mac以外は未対応です。起動はPATHのNode、または利用者が明示指定したNODE_BINを使用します。特定エージェント付属のランタイムは自動選択しません。native経路は実行時のnpm依存なし。T126で本体へ統合した任意のRemotion経路は、motion-lab側のRemotion/React等とChromeを必要とします。静的型検査には開発依存を使います。

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
./scripts/run src/cli.ts sample --plan fixtures/sample-v2.json    # v2台本（図解4種・48秒、旧テーマ）
./scripts/run src/cli.ts sample --plan fixtures/sample-general.json  # 新テーマ（一般・68秒、導入文と出典つき。開発用の架空例）
./scripts/run src/cli.ts sample --plan fixtures/sample-v2.json --renderer remotion  # 本体に統合済みの任意renderer（T126）
./scripts/run src/cli.ts sample --plan fixtures/layout-stress.json --resolution 1080  # 文字配置の検査用（長い見出し・二行字幕）
./scripts/run src/cli.ts lint --plan 台本.json                    # 安全検査だけ
./scripts/run src/cli.ts serve
```
ブラウザーで http://127.0.0.1:4173 を開くとジョブ一覧が出ます。詳細画面で再生、検査結果の確認、版に結び付く承認・差戻しができます（投稿はしません）。字幕の既定は焼き込み（burn、T106で利用者の希望により変更）で、切り替え式は `--subtitles soft`、両方は `both` です。ジョブ管理は `jobs` / `jobs clean`、確認の記録は `review` です（docs/OPERATIONS.md）。停止はCtrl+Cです。サーバーはローカルのみ。生成後の再生にインターネットは不要です。CLIは必ずリポジトリルートを使います（scripts/runが移動します）。npmを利用する環境では `npm run sample` なども使えます。

台本の`theme`は`general`（日常の知識）か`investment`（投資）。未指定は旧形式として投資扱いで、最終場面に推奨・保証を否定する免責が必要です。一般テーマは「結果を保証しない」旨の否定文が必要で、投資の語（銘柄・株価・NISA等）を含めば投資の免責も必要です。`intro`（導入文）は概要欄の先頭に入り、出典は文献名・URL・確認日と使用場面を`metadata.json`の`sources`に保存します（URLの記載は主張の検証済みを意味しません）。詳細はprompts/script.mdとADR-017。

`outputs/<job-id>/sample.mp4` が完成動画。字幕は既定で映像に焼き込み、別ファイル `subtitles.vtt` も作成します（`--subtitles soft` で切り替え式の字幕トラック、`both` で両方）。文字配置の検査結果は `job.json` の `layout`（T106）。`plan.json`、`job.json`、`lint.json`、`metadata.json`、`media-check.json`、サムネイル3案、全場面の確認画像も出力。`outputs/latest.json` は最後に正常完了したジョブを指します。2回実行しても既存出力は上書きせず新しいジョブになります。視聴する確認音は各場面の冒頭だけです。字幕を読み上げる機能はまだありません。

## 本人の工程を通す制作（T104）
T084の判断前チェックリストは、台本の`practice`で指定した原文から各ジョブのテキスト・PNGと概要欄を生成します。末尾の案内は`role: action`。形式と検証制約は [チェックリストの使い方](docs/T084-CHECKLIST.md) を参照。隔離デモMP4の全編AVPlayer再生を確認済みで、T084はdone（ブラウザーUI/textTracks固有確認は未実施）。

`sample` は常に**デモ**（本人の題材選定・考察・台本承認を経ていない試作）です。本番の動画は制作案件（`produce`）からだけ作ります。各工程は確認画面（`serve` → 一覧の「制作案件」）からも操作できます。

```sh
# 1. エージェントが題材候補（ニュース・事象の入口、概念、具体例）を用意し、案件を作る
./scripts/run src/cli.ts produce new --candidates 候補.json --by 'エージェント名'
# 2. 本人が題材を選ぶ（記録者名は本人。本番の案件ではエージェント名を拒否）
./scripts/run src/cli.ts produce select production-xxxxxxxx --candidate price-index --by '本人の名前'
# 3. 本人が考察を書く（ファイルか本文）。この文章がそのまま台本の考察の場面に入る
./scripts/run src/cli.ts produce reflection production-xxxxxxxx --file 考察.txt --by '本人の名前'
# 4. エージェントが下書き（role: reflectionの場面を1つ持つ台本）から台本を作る
./scripts/run src/cli.ts produce script production-xxxxxxxx --plan 下書き.json --by 'エージェント名'
# 5. 本人が台本を読み、表示された「台本の版」で承認（または理由つきで差戻し）
./scripts/run src/cli.ts produce script-review production-xxxxxxxx approve --hash 台本の版 --by '本人の名前'
# 6. 制作（台本が承認済みでなければ不足を表示して拒否）
./scripts/run src/cli.ts produce render production-xxxxxxxx --subtitles burn
# 7. 本人が完成動画を確認画面で見て承認・差戻し（review <ジョブ> でも可）
./scripts/run src/cli.ts produce status production-xxxxxxxx
```
- 題材・考察・台本が変わると台本承認は失効し、古い台本から作った動画は「承認失効」になり承認もできません。運用記録の追記では失効しません。
- 考察をエージェントが整えた場合は `--assisted-from 元の版` で整形版として記録し、本人の原文と区別します。
- 試験・デモは `produce new --demo` の案件で、記録者をtest-agent等にします。デモの承認は本番に転用できません（`review <ジョブ>` の「公開前の判定」で確認）。modeのない既存ジョブはデモ（旧ジョブ）扱いです。
- 記録者名は自己申告で認証ではありません。投稿は引き続き無効です。
- T106の構成案（導入→身近な例→仕組み→本人の考察→活かし方→まとめ）の下書きは `fixtures/draft-price-index.json`。集計の図（meter）と経緯の矢印（travel）、説明に合わせた段の表示（reveal）を使っています。構成案と参考動画の観察は [docs/T106-DESIGN.md](docs/T106-DESIGN.md)。

## チケット管理
正本は `tickets/Txxx.md`。テンプレートは `tickets/templates/TICKET.md`。`tickets` は担当・状態・優先度・段階・依存先、`next` は依存が完了したreadyを担当別に表示します。`check` はID重複、依存欠落、循環、必須項目、人向け手順、doneの依存状態を検証します。制作ジョブはチケットではありません。

## 再開と運用
まず [現在地](docs/STATUS.md)、[仕様](docs/SPEC.md)、[ロードマップ](docs/ROADMAP.md)、[検証記録](docs/VERIFICATION.md) を読み、`next` を実行してください。[復旧手順](docs/OPERATIONS.md)、[設計判断](docs/DECISIONS.md)、[素材台帳](docs/ASSETS.md) も参照。

秘密値はGitにも会話にも保存しません。.env.exampleは将来の設定名だけ。

実装の範囲（2026-10-14、詳細と最新は [docs/STATUS.md](docs/STATUS.md) の先頭）:
- **実装済み（ローカル）**: 確認画面での承認・差戻し。承認は確認対象一式（動画、採用タイトル・概要欄・タグ・チャプター、字幕、サムネイル全案）の版に結び付き、変更で失効します（T033、T095）。予算制御は見積り・上限（既定0 USD）・試行ごとの予約と精算・費用不明額の保持と再送判定・全試行の記録まで（T023、T024、T098）。ただし実接続がないため、費用は常にmock/localの0 USDです。
- **未接続・未完了**: 外部の実API（台本・音声・映像の生成）とYouTube投稿（通常制作のPublisherは無効）。通常制作の予算永続化・ジョブ横断管理・実サービスでの費用照合、実接続を伴う無人運用（M5）、自然なナレーション（現在は確認音）。T140のmock投稿台帳とT141のローカル/mock永続キューは独立モジュールで、通常制作CLIや実投稿への接続完了ではありません。

Geminiによる台本生成T025/T026は今回は不採用として終了し、API実装の完了を意味しません。下書きはT123のエージェント用Skillと`produce script`で扱います。T116は別用途の動画理解リクエスト/応答処理で、mock transport限定、実動画解析・実API送信は未検証です。

T129のE2Eはmock音声パスと偽MP4による工程・承認検査です。実MP4の媒体検査とは区別します。T126には48秒のRemotion実MP4の過去生成記録がありますが、T156以前のRemotion媒体レポートにある全デコード成功・フレーム数は固定値/期待値で、単独では実検査の証明になりません。T156で独立ffprobe・全映像/音声デコード・実フレーム数・PCM測定へ置き換え、失敗時は生成を拒否します。ただし今回の実Remotion再生成はChrome起動失敗のため未検証で、T156は未完了です。T139では隔離したnative経路で合成音の72秒・604秒MP4を生成し、独立ffprobe・全デコード・字幕同期・代表フレーム目視・AVPlayerでの全編再生を確認しました。Remotion経路はChrome Headless Shellの起動タイムアウトで未検証です。T127は音声スライスのパス・秒数集計と同期/音量値の判定までで、WAVを結合しません。実WAVの結合・BGMミックス・再デコードはT138の隔離された合成トーン専用mock経路にあります。実TTS・人の声質評価・通常制作への統合完了を示しません。行単位の照合とRunway依存案は[T142の調査記録](logs/2026-10-13/232152-T142-b79bc42b/evidence/AUDIT.md)を参照。既存dependsは変更していません。

静的型検査は導入済み。型除去は型検査ではありません。これまで契約・有料API・クラウド・push・YouTube操作は行っていません。

## AIエージェント向けの作業履歴
[logs/README.md](logs/README.md) に、ユーザーの指示、実装経緯、判断、検証、TODOの履歴を保存しています。記録者・モデル名を明記し、現在の状態はチケットを参照します。ログの仕組みはT009で導入しました。

## エージェント共通の完了検査
担当は `human / agent`。特定AIを優先せず、実施者名とモデルはログへ別に記録します。
初回は `./scripts/install-hooks` を実行し、[共通手順](docs/AGENT-WORKFLOW.md)に従って `src/worklog-cli.ts start` → 作業と記録 → `finish` → `src/cli.ts check` を実行してください。終了ログがない、未記入、終了後に変更がある場合はcheckとコミット前検査が失敗します。Gitのindexも検証します。

起動は通常のNode 24以上。PATHにないときは `NODE_BIN=/path/to/node ./scripts/run ...` と明示します。開発に使った端末でのNodeの場所は過去の作業ログとdocs/STATUS.mdの時点記録にありますが、自動選択はしません。共通管理CLIはNode/Gitで動き、動画生成だけがmacOS専用です。

## 参考動画の動きの解析とRemotionでの再現（T110、検証環境）
`motion-lab/` は、参考動画のアニメーションをFFmpegで解析してJSONに保存し、Remotion + React + TypeScriptで自作の図形により再現・レンダリングし、フレーム比較して差異を直すための最小検証環境です。本体の制作パイプライン（src/）とは独立し、Remotion等のnpm依存はこの中だけにあります（ADR-020）。動画の取得機能はなく、利用を許可された手元の素材だけを `--rights` で根拠を記録して解析します。手順・判定基準・限界は [motion-lab/README.md](motion-lab/README.md)。Remotionの公式Agent Skillsは `.agents/skills/remotion-best-practices/`（版固定）。

```sh
cd motion-lab && pnpm install --frozen-lockfile
node tools/lab.ts --run demo --theme both   # 自作の合成動画で、解析→レンダリング→比較→正解照合
```

## 定型作業のSkill化
共通原本は `.agents/skills/`。`routine-to-skill` が実績から候補を評価し、既存Skillの更新または新規作成・検証・試用を行います。最初の抽出例（T011）は `repository-task-closeout`（検証・チケット・ログの終了順序）です。どのAIもSKILL.mdを明示的に読んで使えます。自動検出の対応は実行環境ごとに異なります。

## 静的型検査
Node 24以上とpnpmで `pnpm install --frozen-lockfile`、`pnpm run typecheck` を実行します。npmの型検査コマンドも使用可能ですが、再現インストールの正本はpnpm-lock.yamlです。TypeScript 5.9.3と@types/node 24.10.0を固定し、srcとtestsをstrict/noEmitで検査します。型除去による実行と型検査は別です。直接実行は `./scripts/run node_modules/typescript/bin/tsc --noEmit`。
