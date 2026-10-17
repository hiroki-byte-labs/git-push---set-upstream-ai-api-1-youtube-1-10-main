# 作業記録 T172
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-17T03:12:35Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T120再監査（logs/2026-10-17/030502-T120-af598b96）で確認した不具合の追加修正: キュー実行が別ジョブを今回の設定で描画する取違えと、同一制作案件をキューで再描画できない問題。利用者の依頼「issue-to-improvementで改善サイクルを回して」の範囲内。

## 実施内容・変更ファイル
- `src/queue-adapter.ts`: 投入時の描画条件を `<queue>/requests/<job>.json`（wx・0600）に保存しジョブの2番目の入力にする `writeRequest`、実行時に読む `readRequest` を追加。sample経路はジョブの台本（inputs[0]）と記録した条件で、produce経路は記録した条件で実行する。記録のない旧形式ジョブは失敗にする。`enqueueProduce` のジョブIDを `<案件ID>-<8桁>` にし、投入失敗時は書いた条件ファイルを消す。
- `src/local-queue.ts`: `enqueueProduction` に jobId と追加入力の引数を追加（jobIdは案件IDで始まること）。投入時と実行時の検査を `assertQueueRenderable` に統一し、承認済み現行台本なら video-review の再描画も許す。
- `src/cli.ts`: sampleの使い方表示に `voicevox`、`--queue-dir`、`--concurrency` を追記。
- `tests/queue-adapter.test.ts`: 回帰試験2件を追加、既存試験の `jobId === 案件ID` を接頭辞の確認へ更新。
- `tickets/T172.md`、`docs/STATUS.md` を更新。statusはdoneのまま（受入条件の範囲の不具合を修正したため）。

## 判断と理由
- 条件をキューのstate（queue.json）のスキーマへ足すと検証関数と既存データの互換に触れるため、既存の「入力ファイルのハッシュ照合」の仕組みに載せた。条件の改ざんは入力ハッシュ不一致で止まる。
- 旧形式のジョブを今回の設定で描くのは今回の不具合そのものなので、失敗にして再投入を求める。`work/queue` は現在存在せず、既存データへの影響はない。
- 再描画の許可範囲は直接の `produce render`（`assertRenderable` だけ）にそろえた。未選択・考察未入力・台本未承認/古い台本は従来どおり拒否される（既存試験で確認）。
- 定型作業評価: 新Skill候補なし（issue-to-improvementの手順どおり）。

## 検証コマンド・結果・証跡
- 修正前: `./scripts/run --test tests/queue-adapter.test.ts` → pass 6 / fail 2、終了1。1件目は先行ジョブが今回の台本で呼ばれた比較失敗、2件目は2回目の投入が `production is waiting for human review`（evidence/before-fix.txt）。
- 修正後: `tests/queue-adapter.test.ts tests/local-queue.test.ts` → pass 29 / fail 0、終了0（evidence/after-fix.txt）。
- 全体: `./scripts/run --test tests/*.test.ts` → 426 / pass 426 / fail 0、`tsc --noEmit` 終了0（evidence/verify.txt）。`./scripts/verify` は作業回が開いている間はcheckで止まるため個別実行。

## 未実施・制約
- 試験はrunnerを差し替えたもので、キュー経由の実MP4生成は行っていない。
- 中断復旧（recover）と接続部の失敗伝播の試験不足（再監査の軽微指摘）は今回追加していない。
- 常駐の無人運用・並行プロセスでの同時利用の受入れは範囲外のまま。

## TODO・再開方法
- 次はT165（サムネイル品質ゲートの欠測・衝突合格）、続いてT173、T166。
