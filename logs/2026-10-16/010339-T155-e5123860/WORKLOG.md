# 作業記録 T155
- 記録者・実施者: Codex
- モデル: gpt-6 (runtime)
- 開始日時: 2026-10-16T01:03:39.805Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T155「Remotion文字配置を実測し解像度と全テキストで検査する」を実装し、720p/1080pのstress/overflow検査・隔離Remotion生成と実デコードまで検証する依頼。利用者指定によりbacklogから依存完了後に着手。T144の枠なし字幕・native・他チケットを保持し、外部AI直接起動・push・投稿・有料APIは禁止。

## 実施内容・変更ファイル
- README/SPEC/STATUS/AGENT-WORKFLOW、T155と直接依存T126/T153/T154を読了。check/next後にworklog startし、T155をin_progressへ変更。
- motion-lab/src/PlanVideo.tsx、StandardDiagram.tsx、primitives/BurnInSubtitle.tsx、remotion-plan.ts: 共通1920×1080座標とoutputWidth/1920のscaleを維持し、計測対象の区画とpropsを追加。flow/branchの欄幅・折り返し、chapter/diagramの文字サイズを調整。字幕は白文字と影・背景枠なしを維持。
- 新規motion-lab/src/layout-probe.tsx: フレームごとにfonts.readyを待ち、TreeWalker/DOM Range/実CSS/SVG CTMから文字・行・親・区画の画素矩形とfont/color/opacityを取得。
- 新規motion-lab/tools/render-plan.mjs: 同じbundle/propsで実MP4・文字ありPNG・文字非表示PNG・DOM JSONを生成するrenderer API経路。
- 新規src/remotion-layout.ts、src/remotion-visual.ts: 全cue中央・全scene末尾を測定、見出し/全cue/全source番号/通常図解全ラベルの欠落を拒否。実PNGの背景画素からコントラストを計算し、720p左下座標と実pixelSizeをreportへ記録。固定の文字/サムネイル合格値を廃止し、測定frameを実MP4から切り出す。
- src/layout.ts、readability.ts: Remotion測定区画の親外/画面外/同区画重なり/字幕3行を検出。字幕可読性は全cue中央の完全表示を採用し、末尾フェードの実測値もreportとlayout検査に保持。nativeの従来区画・描画は保持。
- fixtures/remotion-layout-stress.jsonとremotion-layout-overflow.json、tests/remotion-layout.test.ts、docs/T155-REMOTION-LAYOUT.mdを追加。ticketとSTATUSへ結果/制約/再開を反映。

## 判断と理由
測定成功を推定しないため、全cue中央＋各scene末尾のDOM測定/背景PNGを必須にし、欠落を例外へ変えた。CSSで折り返しても収まらないものは省略せずlayout失敗にする。source参照件数にはPlan上限がないため最大件数を創作せず、文字上限120の文献20件と、別途200参照の意図的overflowを用意した。合成DOMの単体試験は実DOMと区別する。

remotion-best-practicesルーターとmarkup/render/captions、markupのmeasuring-dom-nodes/measuring-textを参照。既存JSON cue契約はT154を保持し、別の字幕形式へ移行しない。sample-render-verificationに従い/private/tmpへ必要ファイルを複製し、既存outputsを変更せず実生成を試した。Chrome起動制約を迂回しない。

定型作業評価（routine-to-skill、今回1回）: T139/T152/T153/T154と反復する「隔離生成→実デコード→環境制約の明記」は既存sample-render-verification/repository-task-closeoutが既に覆う。今回固有のDOMレポート網羅・座標変換は正本コード/回帰試験/手順文書へ保存し、独立した反復実績のない新規Skillは見送る。Skill原本を重複更新しない。repository-task-closeoutに従い証跡・ticket・STATUS・本文をfinish前に揃える。

## 検証コマンド・結果・証跡
- 開始 `./scripts/run src/cli.ts check` はOK 126 tickets/130 sessions、`next` はagent readyなし。利用者指定のT155を依存done確認後startし、start成功。この作業回以外のログを閉じていない。
- `./scripts/run --test tests/remotion-layout.test.ts tests/presentation.test.ts tests/readability.test.ts tests/remotion-media.test.ts tests/illustration.test.ts`: 最終38件/pass38/fail0/終了0。evidence/target-tests.txt。新規7件はstressの境界長/負fixtureの妥当性、overflow/親外/同区画衝突/字幕3行/画面外、全cue/ラベル/source欠落拒否、実背景PNGの色計算・両解像度の座標変換（合成DOM＋合成MP4）。
- 回帰比較: 原本のHEAD版src/layout.tsを隔離先だけへ戻して `./scripts/run --test --test-name-pattern='measured Remotion overflow|measured box outside' tests/remotion-layout.test.ts`。2件/pass1/fail1/終了1、正常な新Remotion区画を旧検査が受理できない。evidence/before-fix.txt。初回は隔離先でgit showして.git不在となったため、原本で取得し直して再実施。隔離先layout.tsを実装版へ復元。
- `./scripts/run --test motion-lab/tests/*.test.ts`: 33件/pass33/fail0/終了0。evidence/motion-tests.txt。初回は既存試験がSceneTemplateを直接呼ぶため追加useRefが失敗した。refをReactで描画されるMeasuredCanvasへ移し、全試験成功を確認。
- `./scripts/run node_modules/typescript/bin/tsc --noEmit`、motion-lab/node_modules/typescript/bin/tscの `-p motion-lab/tsconfig.json` と `-p motion-lab/tsconfig.tools.json`: すべて終了0。evidence/typecheck-root.txt、typecheck-motion.txt、typecheck-tools.txt。`node --check motion-lab/tools/render-plan.mjs` も終了0。
- `./scripts/run --test tests/*.test.ts`: 実行時338件/pass334/fail4/終了1。evidence/root-tests.txt。既存の確認画面HTTP4件がlisten EPERMで失敗。後で負fixture妥当性1件を追加し最終対象38件は通過。全体成功とは扱わない。
- 隔離先 /private/tmp/T155-verify-fk5z30xo で `NODE_BIN=<PATHのnode> ./scripts/run src/cli.ts sample --plan fixtures/remotion-layout-stress.json --renderer remotion --resolution 720` と1080。最終ソース/fixtureで両方終了1/job.failed、Chrome bootstrap_check_in Permission denied/SIGABRT。evidence/remotion-720.txt、remotion-1080.txt、render-attempts.json、job/props-720/1080.json。MP4・DOM測定JSON・render-reportなし。初回fixtureの免責不足とmeter文字超過は修正してから最終試行した。
- `scripts/agentctl status T155 --require-metered`: 終了2「実行がない」。evidence/metering.txt。管理対象の子実行は起動していない。使用量を推測せず未計測として記録。

## 未実施・制約
実RemotionのDOM実測、render-reportと全scene/全cueの実映像照合、独立ffprobe/全映像音声デコード、実デコードフレームの目視、実DOM overflow負試験、ブラウザー/AVPlayer再生は未実施。Chromeが起動できずMP4自体がないため実施不能。新renderer API経路の実統合成功も未確認。合成PNG/MP4試験は実Remotion生成成功ではない。音声は確認音でナレーションではなく実聴なし。外部API・有料サービス・push・投稿・別AI起動なし。

## TODO・再開方法
受入条件が未達のためT155はin_progressのまま、この作業回をpausedで閉じる。Chromeが利用可能な環境でdocs/T155-REMOTION-LAYOUT.mdの隔離720p/1080p stress生成とoverflow負生成を実施する。実DOM/PNG/report/実MP4を比較し、字幕1〜2行、見出し/全diagram/source labelsの非重複と画面内配置を確認。独立probe/全デコード・目視・実再生まで通し、必要な実装修正後だけdoneへ進める。終了記録はこの本文確定後にfinish paused、その後cli checkを実行して結果を利用者へ報告する。
