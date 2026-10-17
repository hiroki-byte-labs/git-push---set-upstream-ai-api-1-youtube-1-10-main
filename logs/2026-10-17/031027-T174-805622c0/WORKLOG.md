# 作業記録 T174
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-17T03:10:27Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T120再監査（logs/2026-10-17/030502-T120-af598b96）で確認した不具合の追加修正: 改行入りの考察でcueに改行が残りVTTが壊れる問題。1行改行(optimizeSubtitleLines)が制作経路に未接続な点の扱いも整理。利用者の依頼「issue-to-improvementで改善サイクルを回して」の範囲内。

## 実施内容・変更ファイル
- `src/production.ts`: `splitCues` で改行と前後の空白を除いてから `splitSmartCues` に渡す（T174以前の `splitCues` と同じ扱い。narrationも同じ除去をしている）。
- `src/commands/sample.ts`: `buildVtt` がcue本文の空行と各行の前後空白を除く（行の改行は保持）。どの経路から改行が来てもcueが途中で終端しないための防御。
- `tests/production.test.ts`、`tests/plan.test.ts`: 回帰試験を各1件追加。
- `tickets/T174.md`: 追加修正と、optimizeSubtitleLines未接続の事実を結果欄に追記（statusはdoneのまま。cue分割の受入範囲は満たし、表示の改行はT187で扱う）。
- `tickets/T187.md`: 新規（ready）。1行改行をnative/Remotionの焼き込み字幕へ接続し実描画で確認する。
- `docs/STATUS.md`: 再開地点を追記。

## 判断と理由
- cue本文の改行は、Remotionの `pre-line` で2行表示に使う余地があるため、cueの検証で一律に拒否はしない。代わりに考察の入力側で除き、VTT出力側では空行だけを除く。
- optimizeSubtitleLines の接続は、native（Swiftの折り返し）とRemotionの両方の表示と文字配置検査に関わり、実描画での確認が必要。cue分割の不具合修正とは受入条件が別なので新規チケットに分けた（既存チケットで同じ目的のものはない: T106/T144/T155は配置・見た目、T180はcue時刻同期）。
- 定型作業評価: 「再監査の指摘→回帰試験→修正→記録」はissue-to-improvementの手順そのもので、新Skillは不要。

## 検証コマンド・結果・証跡
- 修正前: `./scripts/run --test tests/production.test.ts tests/plan.test.ts` → pass 38 / fail 2、終了1（evidence/before-fix.txt）。
- 修正後: 同2ファイル＋tests/subtitle-optimizer.test.ts → pass 45 / fail 0、終了0（evidence/after-fix.txt）。
- 全体: `./scripts/run --test tests/*.test.ts` → 424 / pass 424 / fail 0、`tsc --noEmit` 終了0（evidence/verify.txt）。`./scripts/verify` は作業回が開いている間は先頭の `cli.ts check` が「未終了作業」で止まるため、テストと型検査を個別に実行した。finish後に `cli.ts check` を実行する。

## 未実施・制約
- 実MP4の生成・再生は行っていない（文字列処理の修正で、描画経路は変えていない）。
- `src/documentary.ts` の `splitSmartCues(paragraph.text)` は段落本文をそのまま使う。段落に改行が入る入力は現状のfixtureにないため変更しておらず、VTT側の防御だけが効く。
- 既存の承認済み台本は再生成しない（台本ファイルは保存済みのもの）。

## TODO・再開方法
- 次はT172（キューの入力取違えと再描画不可）。T187は着手可能。
