# 作業記録 T156
- 記録者・実施者: Codex
- モデル: gpt-6 (runtime)
- 開始日時: 2026-10-15T15:24:04.464Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T156の実媒体検査を実装し、異常系テストと隔離Remotion出力検証、終了記録まで行う。対象チケットだけを扱い、他者の変更を保持する。外部AI起動・有料API・push・投稿は許可範囲外で実行しない。受入未達ではdone/completedにしない。

## 実施内容・変更ファイル
- README、SPEC、STATUS、AGENT-WORKFLOW、T156と依存T126/T139、T150、指定3 Skillを読み、開始check/next後に正規startでこの作業回を開始。T156をin_progressにして着手し、最後は環境待ちblockedへ。
- `src/remotion-media.ts`を追加。Remotion同梱ffprobe（なければPATH）と既存FFmpegで完成MP4を独立検査する。必要stream/H264・AAC/字幕/解像度/fps/映像・音声・コンテナ尺、全映像・音声デコード、progressによる実出力frame数、PCMの尺・peak・RMS・非ゼロサンプルを測定。media-check.jsonに期待値、実測値、許容差、未測定、SHA-256、実行コマンドと終了値・出力を保存する。
- `src/remotion-visual.ts`の固定fullDecode成功・期待frame数の実測欄代入を削除し、mux直後にinspectorを呼ぶ。必須検査に失敗した場合は失敗JSONを保存して例外を投げる。既存sampleのfailed処理によりvideo-checked/latest更新を止める。native媒体実装は変更なし。
- `tests/remotion-media.test.ts`に12シナリオを追加。README/SPECに現実装と実Remotion統合未完了を追記。T156/STATUSに試験結果、制限、再開手順を記録。
- この作業回のevidenceへ対象/全体試験、型検査、隔離生成、描画subprocessだけを置換したジョブ試験の実行ハーネスと結果、outputs復元・照合結果を保存。動画/音声本体は保存しない。

## 判断と理由
- フレーム数は期待値やコンテナのnb_framesで合格にせず、同期による補完を禁止したFFmpegの全デコード出力数を使う。stream尺と実PCM尺を両方検査し、AAC末尾paddingには0.1秒を許容、frame数は厳密一致とした。
- LUFS/true peak、場面ごとの確認音位置、字幕表示内容/時刻、人の声質、native固有PSNRを未測定として分離する。PCM統計の音声は自作確認音でナレーションではない。
- 同梱ffprobeは最初dylib読込に失敗した。既設Remotion実装のget-explicit-envを読んで、同梱実行ファイルに限りDYLD_LIBRARY_PATHをそのディレクトリへ指定し、指定内容もコマンド記録へ残した。検査不能をpassにはしない。
- T150以降の実Remotion再生成はChrome起動失敗で未達。置換した描画試験を実Remotion描画の成功に読み替えず、T156はblocked、作業回はpausedとする。HTTP全体試験4件のlisten制限はT156の媒体実装を変えて解決する対象ではない。
- 定型作業評価: T139/T145/T156で隔離生成とoutputs保護照合が反復しており、既存sample-render-verificationの更新を選択。skill-creatorを読み、cwd照合と事前manifest/latest内容保存の追記案を一時コピーで作成。共有`.agents`へのapply_patchはsandboxの書込拒否で適用できず、evidence/skill-proposal.patchに候補を保存した。新Skillは作らない。一時候補を読み、cwdガードによる停止/隔離先での成功を試用した。quick_validateはPyYAML欠落、補助形式検査のみ成功。候補原本への反映は未完了とする（同一作業回の再帰評価なし）。

## 検証コマンド・結果・証跡
- 開始 `./scripts/run src/cli.ts check` は終了0、126 tickets/123 sessions。`next`はT152/T156を表示。`worklog-cli.ts start T156 --agent Codex --model gpt-6 --model-source runtime --request ...` はこの作業ディレクトリを作成した。他者のopen sessionは閉じていない。
- `./scripts/run --test tests/remotion-media.test.ts` の実装前は新inspectorのmodule欠落で失敗（before-fix.txt、終了1）。これは旧実装に対する実媒体試験結果ではなく、新しい検査インターフェースが未実装の段階の記録である。
- `./scripts/run --test tests/remotion-media.test.ts tests/media.test.ts` は16 tests/pass16/fail0/skip0、終了0（after-fix.txt）。正常/字幕付き、末尾切断、期待尺ずれ、音声尺ずれ、音声stream欠落、字幕stream欠落、inspector/decoder起動失敗、解像度/fps不一致、実デコードframe数不足を検証。既存nativeのPSNR回帰試験4件も成功。
- `./scripts/run --test tests/*.test.ts` は332 tests/pass328/fail4/skip0、終了1（full-tests.txt）。approval.test.ts 1件、production.test.ts 1件、review.test.ts 2件が127.0.0.1 listen EPERMで失敗。未試験を成功扱いしない。
- `./node_modules/.bin/tsc --noEmit`、`./motion-lab/node_modules/.bin/tsc --noEmit -p motion-lab/tsconfig.json` はそれぞれ終了0（typecheck.txt、motion-typecheck.txt）。
- `python3 .../evidence/isolated-render.py` は隔離コピー `/private/tmp/T156-render-eoykiwq4` を作り、NODE_BIN=/opt/homebrew/bin/nodeでsample-surname-illustration.jsonを`sample --renderer remotion --subtitles both`した。実生成コマンド終了1、ChromeのFailed to launch the browser process、job.failed、video-checkedなし（isolation.json、isolated-render.txt、isolated-job.json）。MP4が無いので独立MP4検査・フレーム目視・実再生には進めない。この時点で元outputs2,253件は不変（outputs-preserved.json）。
- `T156_FFMPEG=<既設FFmpeg> node --experimental-test-module-mocks job-integration.mjs` を隔離rootをcwdとして実行し、5シナリオのassertion成功、終了0（job-integration-isolated.txt、job-integration-summary.json）。Chromium描画subprocessのみ色面映像生成で置換し、実RemotionVisualのmux/inspectionとsampleを実行。正常は720frames、video/audio stream30秒、PCM30.037333秒、completed/video-checked。切断・29秒化・音声欠落・inspector終了1はfailed、video-checkedなし、latest更新なし。実Remotion映像ではない。
- 初回の同ハーネスを誤って元repo cwdで起動し、outputsに試験5ジョブとlatest更新が発生した（job-integration.txt、misplaced-integration-summary.json）。生成した5件だけを隔離root/misplaced-jobsへ移し、latestを直前の既存completed jobへ戻した。その内容SHA-256はT139の過去証跡に一致し、mtimeも復元した。全2,253件のサイズ/mtimeはT145のoutputs-before.jsonに一致し、うち2,248件のSHA-256はT139のoutputs-before.jsonに一致（output-restoration.json）。他者の既存ジョブは削除/変更していない。
- cwdガードを追加したハーネスを元repoから起動すると書込前のassertionで終了1（cwd-guard.txt）、隔離先からの再試験は5件成功。改善案の実試用として記録。
- skill-creatorのquick_validate.pyを一時Skill候補へ実行したが `ModuleNotFoundError: yaml`、終了1（skill-validation.txt）。標準ライブラリでfront matter/未記入/既存参照先を補助検査（skill-manual-validation.txt）。Skill原本は未適用。
- Token Monitorも読み、`scripts/agentctl status T156 --require-metered`は「実行がない」、終了2（metering.txt）。この作業回は外部AI/製品内子エージェントを起動しておらず、管理対象実行なし。使用量を推測で補完せず、計測完了とは報告しない。

## 未実施・制約
受入条件の「T150以降のRemotion出力を独立検査して経路統合を確認」が未達。Chromeが起動せず実Remotion MP4が作られなかったため、その映像の全デコード・PNG目視・ブラウザー/AVPlayer実再生は未実施。localhostが禁止され、既存HTTP試験4件も合格していない。自然音声品質・スピーカー試聴・LUFS/true peak・字幕表示同期は今回測定していない。元outputsの作業開始時の全hash保存は行っていなかったため、復旧確認では保存済みの過去manifestを使用した事実を明示する。Skill共有原本は書込拒否、quick_validateはPyYAML欠落で未完了。契約、外部API、投稿、pushは行っていない。

## TODO・再開方法
Chrome/localhost利用可能な環境で新しいT156作業回を開始する。隔離rootへ最新srcを同期し、事前outputsマニフェスト/latestの内容とcwdを確認して、T150題材を実Remotion生成する。置換ハーネスを使わず、job.completed/video-checkedと実測媒体レポートを照合し、独立ffprobe/全デコード、実デコードPNG、実再生を記録する。HTTP4件を含む全体試験を再実行する。Skill候補パッチは書込可能な環境で原本差分を確認して反映し、PyYAMLのある環境で形式検査する。受入達成後だけT156をdoneとする。今回はticket.blockedでこのログを `worklog-cli.ts finish ... --status paused` により閉じ、その後cli checkを実行する。最終終了状態とハッシュはsession.json、検査の成否は実際のCLI出力を正本とする。
