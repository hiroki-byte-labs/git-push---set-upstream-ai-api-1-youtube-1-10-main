# 作業記録 T127
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-17T04:45:09Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T120再監査（043529）で確認した不具合を修正する。
- checkSubtitleSync が、音声長がNaNのときに合格にしてしまう。
- synthesizeLongFormAudio が、接続の返す durationSec を有限値かどうか検査していない。

利用者の依頼「改善を続けて下さい」の範囲内で行う。

## 実施内容・変更ファイル
- `src/audio-pipeline.ts`:
  - `synthesizeLongFormAudio` は、非有限・負の `durationSec` を例外にする。
  - `checkSubtitleSync` は、未測定・非有限・負の音声長をエラーとして記録し、合算しない。
- `tests/audio-pipeline.test.ts`: 回帰試験を2件追加した（NaN・undefined・負値・無限大の同期検査、NaNを返す接続の合成）。
- `tickets/T127.md`: 追加修正と記載の訂正を書いた。status は done のまま。
- `tickets/T188.md`: 新規（ready）。同期・音量・無音検査と台本版の照合を、実音声の制作経路へ接続する。
- `docs/STATUS.md`: 編集ツールで更新した。

## 判断と理由
- 未測定を0秒として扱うと、ずれも0になり、「測れていない」ことが「合っている」に変わってしまう。そのため検査の失敗にした。
- 制作経路への接続は今回の範囲から外した。閾値（LUFSを不合格にするか記録のみにするか）の決定と、say/voicevox の実音声での検証が必要で、受入条件が別になるため新チケットに分けた。重複がないか確認した既存チケット:
  - T170: say の実装
  - T179: VOICEVOX
  - T180: アライメント
  - T181: SE/BGM
  - T138: 模擬ミックス
  - いずれも「制作経路の合否に同期・音量・無音を使う」ことを受入条件に含んでいなかった。
- 定型作業評価: 新しい Skill の候補はない。

## 検証コマンド・結果・証跡
- 修正前: `./scripts/run --test tests/audio-pipeline.test.ts` は pass 7 / fail 2、終了1（evidence/before-fix.txt）。
- 修正後: `./scripts/run --test tests/*.test.ts` は 441件中 pass 441 / fail 0、終了0（evidence/after-fix.txt）。`tsc --noEmit` は終了0。
- `./scripts/run src/cli.ts tickets` で、T188 が ready / 依存 T127,T170 として読めることを確認した。

## 未実施・制約
- 実音声の生成は行っていない。この関数は say の経路では使われていない（T188で接続する）。
- 同期検査の許容誤差が累積ずれだけを見る点（再監査の軽微指摘）は変えていない。

## TODO・再開方法
- 次は verify に motion-lab の試験を加える（T013）。T188 は着手できる状態。
