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
./scripts/verify   # check・テスト・型検査（motion-labの試験・型検査を含む）を一括実行（コミット前）
```

10・15・20分のダミー台本による資源計測は [長尺ベンチマーク手順](docs/LONGFORM-BENCHMARK.md) を参照。実生成はリポジトリ外の隔離コピーで行い、子プロセスを含むRSSと完成MP4を検査します。`--dry-run` は推計だけで、実生成の合格を意味しません。

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

`outputs/<job-id>/sample.mp4` が完成動画。字幕は既定で映像に焼き込み、別ファイル `subtitles.vtt` も作成します（`--subtitles soft` で切り替え式の字幕トラック、`both` で両方）。文字配置の検査結果は `job.json` の `layout`（T106）。`plan.json`、`job.json`、`lint.json`、`metadata.json`、`media-check.json`、サムネイル3案、全場面の確認画像も出力。`outputs/latest.json` は最後に正常完了したジョブを指します。2回実行しても既存出力は上書きせず新しいジョブになります。既定の `--audio mock` は各場面の確認音です。`--audio say` はmacOS標準音声でcueを読み上げ、指定時間を超える発話は切り捨てず停止します（[時間調整の手順](docs/SAY-AUDIO-TIMING.md)）。`--audio voicevox` はローカルエンジン向けアダプターを実装済みですが、実エンジンの発音・声質・再生検証は未完了です（[必要条件と実行手順](docs/VOICEVOX-LOCAL-AUDIO.md)、T179 review）。

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
# 先に produce fact-check <案件ID> で未確認のひな型を作り、原本・素材条件を照合したレポートを --report で取り込む
# 詳細: docs/FACT-CHECK-APPROVAL.md。自動ひな型だけでは承認できない
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

実装と検証の現在地（2026-10-17、詳細は [現在地](docs/STATUS.md) と各tickets）:

- ローカル制作は本人の題材選択・考察・台本承認・完成動画承認を通します。T171の事実・権利確認は現在の案件/台本版に結合し、レポート変更でも再承認が必要です。自動ひな型は未確認のままです（[確認手順](docs/FACT-CHECK-APPROVAL.md)）。
- 音声の既定は合成確認音。T170のmacOS sayは実発話を組み込め、48秒の実MP4生成・独立デコード・等速全編再生を確認しました。T179のVOICEVOXはアダプターと注入transport試験までで、実エンジン接続・本人の声色採用は未完了です。
- T172で `sample` / `produce render` にローカル永続キューを接続済みです。`--queue`、`--queue-dir`、`--concurrency` で選択し、未承認の制作案件の投入を拒否します。既定の直接実行と、常駐の無人運用は区別します。
- T156は30秒/720フレームの実Remotion生成・独立媒体検査を2026-10-16に完了済みです。過去のChrome起動失敗は当時の記録です。ただし可読性等の受入れはT158、見せ方の確認はT150のreviewが残り、媒体検査の合格だけで作品の品質合格にはなりません。
- T175は隔離したnative/mockの10分/14400フレームを実生成・全デコードし、子プロセスを含むRSSを計測、AVPlayerで8倍速全編再生を確認しました。実ナレーション付きの10〜20分番組、15/20分とRemotionの今回の資源実測、全編等速の視聴品質は別に残ります（[計測手順](docs/LONGFORM-BENCHMARK.md)）。
- 外部の有料生成APIと実YouTube投稿は未接続。通常制作のPublisherは無効です。予算制御は見積り・上限・予約/精算・費用不明額の保持まであり、実サービスの費用照合・無人運用の受入れは未完了です。T140のmock投稿台帳は実投稿の成功を示しません。

Geminiによる台本生成T025/T026は不採用という判断の終了です。下書きはT123のエージェント用Skillと `produce script` で扱います。T116は別用途の動画理解リクエスト/応答処理で、mock transport限定、実動画解析・実API送信は未検証です。

T129のE2Eはmock音声パスと偽MP4による工程検査です。T156以前のRemotionレポートの固定fullDecode/期待フレーム値は実デコードの証拠に使いません。実媒体の根拠はT156の独立FFprobe/FFmpeg検査と各作業回の証跡を参照してください。T138の合成WAV/BGMミックス・LUFS実測、T139のnativeによる72秒/604秒MP4・字幕同期・実再生も、自然TTSの声質受入れとは区別します。

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

課題の確認から改善まで続ける場合は [issue-to-improvement](.agents/skills/issue-to-improvement/SKILL.md) を使います。「改善サイクルを回して。課題を調べてチケット化し、ローカルで進められる修正と検証まで行って」と依頼できます。調査だけなら「今回は候補一覧まで」と指定します。既存チケットを再利用し、重複起票を避け、1件ずつ検証・記録して残件を見直す手順です。

共通原本は `.agents/skills/`。`routine-to-skill` が実績から候補を評価し、既存Skillの更新または新規作成・検証・試用を行います。最初の抽出例（T011）は `repository-task-closeout`（検証・チケット・ログの終了順序）です。どのAIもSKILL.mdを明示的に読んで使えます。自動検出の対応は実行環境ごとに異なります。

## 静的型検査
Node 24以上とpnpmで `pnpm install --frozen-lockfile`、`pnpm run typecheck` を実行します。npmの型検査コマンドも使用可能ですが、再現インストールの正本はpnpm-lock.yamlです。TypeScript 5.9.3と@types/node 24.10.0を固定し、srcとtestsをstrict/noEmitで検査します。型除去による実行と型検査は別です。直接実行は `./scripts/run node_modules/typescript/bin/tsc --noEmit`。
