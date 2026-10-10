# 作業記録 T096
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-10T06:06:51.996Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T096: docs/CLAUDE-REPAIR-INSTRUCTIONS.mdに従い、サムネイルの代替文言（題名・promise）も描画と同じ解決で禁止表現検査し、隔離回帰試験と記録を完了する。有料API・push・投稿は行わない

## 実施内容・変更ファイル
- 開始前: T095の作業回終了後に `check` OK（34 sessions）。読んだもの: tickets/T096、src/lint.ts、src/timeline.ts buildThumbSpecs、src/plan.ts（thumbnailの型と検証）、src/commands/sample.tsの処理順、tests/lint・timeline・thumbnails、T093 REVIEW.md指摘3、scripts/render.swiftのtitle使用箇所。
- tests/thumbnails.test.ts: T096の試験4件を先に追加し、未修正で3件失敗を確認した。
- src/plan.ts: thumbnailText（最終文言と由来）を追加。
- src/timeline.ts: buildThumbSpecsをthumbnailText経由に変更（出力は同じ）。
- src/lint.ts: サムネイル検査をthumbnailTextの最終文言に変更し、由来をメッセージに付けた。
- docs/HANDOFF.md（台本形式の表と安全検査の節）、tickets/T096.md（done）、docs/STATUS.md。

## 判断と理由
- 共通関数はplan.tsに置いた。timeline.tsとlint.tsはどちらも既にplan.tsをimportしており、新しい依存や循環を作らないため。lintがtimelineをimportする案は、描画側の依存を検査へ持ち込むので避けた。
- 検査の場所（where）は従来どおり「サムネイル」にし、既存試験とlint.jsonの読み手を変えない。代わりにメッセージへ由来（title/promise/thumbnail.headline/sub）を足し、どこを直すか分かるようにした。
- 明示した文言があるときは、描かれない代替値（title/promise）をサムネイルとしては検査しない。描画と検査の対象を一致させるのが目的のため。title/promiseそのものの扱い（metadataで候補除外・issue）は変更していない。
- 生成経路の確認は、既存outputsにfailedジョブを増やさないよう、リポジトリの隔離コピーで行った。

## 検証コマンド・結果・証跡
- `./scripts/run --test tests/thumbnails.test.ts`（修正前）: tests 7 / pass 4 / fail 3、終了コード1。evidence/before-fix.txt。
- `./scripts/run --test tests/thumbnails.test.ts tests/lint.test.ts tests/timeline.test.ts tests/metadata.test.ts tests/plan.test.ts`（修正後）: tests 61 / pass 61 / fail 0、終了コード0。evidence/after-fix.txt。
- `./scripts/run node_modules/typescript/bin/tsc --noEmit`: 出力なし、終了コード0。evidence/typecheck.txt。
- 隔離コピー（scratchpad/t096-gen）で `./scripts/run src/cli.ts sample --plan bad.json`（v2からthumbnailを削除、title=必ず儲かる）: 終了コード1、「ERROR [guarantee] サムネイル: …（描画する文言。titleから）」。job.json status=failed、events=[lint-checked]、出力はjob.json/lint.json/plan.jsonのみ。evidence/generation-path.txt。
- finish後に `cli.ts check` と `next` を実行する。

## 未実施・制約
- 実際のサムネイル描画（Swift）は実行していない。描画仕様の文言の一致は単体試験で確認した。
- 禁止表現は正規表現による安全網であり、自然言語の完全な安全保証ではない（チケットの対象外）。
- Skill化の評価: 今回の作業は指示書の手順どおりで、新しい反復はない。全体の評価はT099で行う。今回は見送る。

## TODO・再開方法
- 次はT097（免責の否定内容）を新しい作業回でstartする。
- 再開: NODE_BINを指定 → `./scripts/run src/cli.ts check` → `next`。
