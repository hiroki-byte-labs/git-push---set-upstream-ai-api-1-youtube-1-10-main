# 作業記録 T175
- 記録者・実施者: Codex
- モデル: gpt-6.1-sol (runtime)
- 開始日時: 2026-10-17T00:59:10.201Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
他の作業を進める: T175の出力隔離・子プロセスRSS・媒体欠測の安全停止・実測/推計分離を修正し隔離実動画で検証する

## 実施内容・変更ファイル
- T175を再開し、`scripts/benchmark-longform.ts` を修正。ソース・素材を外部一時領域へ複製し、子sampleのcwdを明示。既存/元ツリー/symlinkの出力先を拒否する。Node/Swift/FFmpeg/Chrome等の子孫RSSとディスクを約100msで採取し、上限超過とtimeoutでプロセスグループを停止する。
- latestのjob ID・job.completed・実MP4の所在を検査し、別領域で `inspectRemotionMedia` のFFprobe/FFmpeg検査を再利用。`src/remotion-media.ts` は呼び出し側がrenderer/ナレーション種別を指定できるようにし、nativeをRemotionと記載しないようにした。
- 推計と実測をschema:2で分離。dry-runはestimated、実測と合格はnull。未検査を成功にしない。生成失敗ではfpsを未測定とする。
- `tests/benchmark-longform.test.ts` に出力保護・欠測・破損・異常終了・RSS上限・timeout・実子孫メモリの回帰検証を追加。ダミー台本タイトルを短くし、全10/15/20分入力でサムネイル契約の整合も確認する。
- READMEに手順リンク、`docs/LONGFORM-BENCHMARK.md` に実行/合否/計測範囲/制約を記載し、T175/STATUSを更新した。動画は隔離一時領域だけに保持した。

## 判断と理由
- 元実装はsampleのcwdと探索する出力先が一致せず、存在しない媒体の検査を省略して合格し得た。親NodeだけのRSSもrendererの負荷を表さない。実行を子プロセス化し、実jobと独立測定を成功条件にした。
- 実レンダリング1回目はSwiftの一時lockが走査中に消えたENOENTで計測停止した。消えたファイルだけを無視し、その他の失敗は停止するようにした。2回目はダミーの長いタイトルがサムネイル生成で失敗したため、ダミー入力を短いタイトルへ修正した。どちらも失敗として保存した。
- 定型作業評価: T139/T156/T170/T175で隔離生成・元outputs照合・実測/再生の区別が反復している。既存sample-render-verificationとrepository-task-closeoutで既に扱うため新Skillは不要。今回も隔離コピー、全デコード、実PNG目視、実再生と元outputs照合に適用した。RSS/一時lock処理はT175のコード正本で自動化済みで、Skillに実装を複製しない。全編再生はAVPlayer、ブラウザーは部分確認と区別する。

## 検証コマンド・結果・証跡
- `./scripts/run --test tests/benchmark-longform.test.ts`: 修正前5試験中3成功/2失敗・終了1を `evidence/before-fix.txt` に保存。初回はevidenceディレクトリ未作成でリダイレクトに失敗したため、作成後に実行した。最終対象8試験すべて成功・終了0は `evidence/final-target.txt`。その後のパス境界追加も全体試験で検証した。
- `./scripts/run --test tests/*.test.ts`: 最終422/422成功、失敗0、終了0（`evidence/all-tests-final.txt`）。`./scripts/run node_modules/typescript/bin/tsc --noEmit` 終了0（`evidence/typecheck-final.txt`）。
- 実行: `./scripts/run scripts/benchmark-longform.ts --minutes 10 --timeout 1200`。1回目はlock走査エラーで終了1（`evidence/actual-native.txt`）、2回目はheadline21字で終了1（`evidence/actual-native-final.txt`）、修正後3回目は終了0（`evidence/actual-native-success.txt`）。実測 `evidence/actual-report.json` は600秒/14400frames、最大RSS1463.6875MiB、隔離ディスク310.5923MiB、生成67.5287秒、RSS666サンプル。元媒体検査JSONを信用せず独立検査を実行し、映像/音声600秒と全デコード合格を確認（`evidence/independent-media.json`）。
- `./scripts/run scripts/benchmark-longform.ts --minutes 20 --dry-run`: estimated、実測と合否null、終了0（`evidence/dry-run-20m.txt`）。実20分成功の根拠にはしない。
- `swift scripts/verify-avplayer-playback.swift <隔離MP4> 8 180`: readyToPlay、1472進行サンプル、600秒、75.1858秒でended=true、無音、終了0（`evidence/avplayer.txt`）。
- CUAのin-appブラウザーで隔離serveのjobページを開き、native controlsから再生。readyState4/1280x720/600秒、1xで7.34→31.57→56.43→114.80秒へ進行。115.23秒でpauseしタブを閉じサーバー停止。全編ブラウザー再生ではない（`evidence/browser-playback.json`）。
- FFmpegで完成MP4の5/300/595秒を抽出し、`evidence/frames.png` を目視。章/見出し・図解・焼き込み字幕を確認し、代表3枚には切れ/字幕欠落なし。300秒は新場面の登場開始。コマンド/終了0は `evidence/frame-extraction.json`。
- 元outputs全2253ファイルの集合・サイズ・mtime ns・SHA-256が開始時と一致（`evidence/outputs-before.json`, `evidence/outputs-preserved.json`）。`git diff --check` 終了0（`evidence/diff-check.txt`）。
- `scripts/agentctl status tsk_0mvbous1663772df46375 --require-metered`: usage空/metering_status=missing、終了4（`evidence/metering.txt`）。対話使用量は未完了で数値を推測していない。

## 未実施・制約
- 今回の実生成はnative/mockの10分だけ。15/20分とRemotion実生成、実ナレーション、外部API、投稿、commit/pushは実施していない。
- 等速全編視聴・ブラウザー全編完走・声質試聴・字幕UI選択は未実施。AVPlayerの8倍速全編再生とブラウザー115秒部分再生を区別する。ダミー入力/合成確認音であり、一次資料を実照合した作品ではない。
- 約100msのRSSサンプリングは短いピークや離脱daemonを完全追跡しない。ディスクはファイルサイズでAPFS物理占有ではない。独立媒体検査とプレイヤー再生はRSS計測区間外。最大値からメモリリークなしとは断定しない。
- 成功実測後の最終変更は元ツリー内の..で始まる名前を拒否する境界検査と文書更新だけ。成功した外部一時領域・生成・独立媒体検査の経路は同じで、全試験を再実行した。対話計測はmissingのまま未完了。

## TODO・再開方法
- T175の計測基盤修正と10分実測は完了。条件別の追加測定は `docs/LONGFORM-BENCHMARK.md` に従い、新しい空の外部作業先を使う。既存の試行先は上書きしない。成功動画は `actual-report.json` のmediaValidation.pathにある一時成果物。
- 次はREADME/SPECの現在説明と最新チケット/実装の整合をT120の新作業回で進める。T179の実エンジン条件調査やT167の受入証跡も別の課題として残る。
- 使用量は正規Hookの取込後にstatusで再確認し、計測DBの手入力や迂回をしない。閉じたログの訂正は新しい作業回で行う。
