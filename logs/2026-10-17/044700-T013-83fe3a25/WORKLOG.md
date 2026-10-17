# 作業記録 T013
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-17T04:47:00Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T120再監査（043529）の指摘への対応。対象は次の2点。
- `./scripts/verify` が motion-lab の試験と型検査を実行していないため、Remotion部品の回帰を検出できない。
- motion-lab の型検査は、本体の未使用importで現在失敗している。

verify への追加と型エラーの修正を行う。利用者の依頼「改善を続けて下さい」の範囲内。

## 実施内容・変更ファイル
- `scripts/verify`: 本体の型検査の後に、motion-lab の試験（`node --test tests/*.test.ts`）と、tsconfig.json・tsconfig.tools.json の型検査を加えた。
  - motion-lab の依存が未導入なら失敗する。
  - `VERIFY_SKIP_MOTION_LAB=1` を指定したときだけ、明示して省く。
- 未使用importを削除した（動作は変えていない）。
  - `src/orchestration-pipeline.ts`: 20件
  - `src/audio-pipeline.ts`: ConnError
  - `src/queue-adapter.ts`: resolve
- `README.md`、`docs/AGENT-WORKFLOW.md`: verify の範囲を更新した。作業回が開いている間は check が止まるため、テストと型検査は個別に実行する、という手順を追記した。
- `tickets/T013.md`、`docs/STATUS.md` を編集ツールで更新した。status は done のまま。

## 判断と理由
- motion-lab の tsconfig.tools.json は本体の src も型検査し、noUnusedLocals が有効になっている。本体の tsconfig はこれを検出しないため、どちらか一方の検査だけでは足りない。両方を verify に入れた。
- 依存がない環境で黙って省くと、未実行が合格に見える。そのため既定では失敗にし、省く場合は名前つきの環境変数で明示させる。
- 未使用importの削除は、motion-lab の型検査を通すために必要な最小の変更にとどめた。T128 の未接続な関数は、構造の問題として監査記録に残してあり、今回は削除していない。
- 定型作業評価: 「作業回が開いている間の verify」の扱いは、この会話で3回繰り返した。手順として AGENT-WORKFLOW に追記した。新しい Skill は不要。

## 検証コマンド・結果・証跡
- 修正前: motion-lab の `tsc -p tsconfig.json` は終了0、`tsc -p tsconfig.tools.json` は TS6133/TS6196 が22件で終了2（evidence/before-fix.txt）。
- 修正後: 両方の tsconfig の型検査と、本体の `tsc --noEmit` が終了0。
- verify から check の1行を除いた一時的な写しで本体を実行した結果、本体試験は 441 / pass 441、motion-lab 試験は 33 / pass 33、終了0（evidence/after-fix.txt）。
  - 最初の写しは sed の区切り文字の誤りで空になっていたため、grep -v で作り直して実行した。
- 分岐の確認（evidence/branches.txt）:
  - motion-lab の依存がない場合: 案内を出して終了1。
  - `VERIFY_SKIP_MOTION_LAB=1` の場合: 未実行を表示して終了0。
- finish 後に、実際の `./scripts/verify` を実行する。

## 未実施・制約
- motion-lab の lint（eslint）は verify に入れていない。現在の結果は確認していない。
- T128 の未接続の関数（attachNarrationMetadata 等）は残っている（T188 と監査記録）。

## TODO・再開方法
- finish 後に `./scripts/verify` を実行し、成功したらコミットする。
