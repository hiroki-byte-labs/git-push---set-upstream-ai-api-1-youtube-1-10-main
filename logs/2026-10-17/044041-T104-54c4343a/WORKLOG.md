# 作業記録 T104
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-17T04:40:41Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T120再監査（logs/2026-10-17/043529-T120-a3bf06b6）で確認した不具合を追加で直す。依頼は「改善を続けて下さい」で、その範囲内で行う。
- 本番の完成動画を承認するとき、記録者名を省略すると既定名の cli-user／local-user で通ってしまう。
- AGENT_NAME が Magenta などの人名を誤って拒否する。

## 実施内容・変更ファイル
- `src/production.ts`:
  - `AGENT_NAME` の `agent` を `\bagent`、`bot\b` を `\bbot\b` に変えた。
  - 既定名の一覧 `DEFAULT_REVIEWERS`（cli-user, local-user）を追加した。
- `src/review.ts`: `recordReview` は本番のジョブで、空の名前と既定名を拒否する。
- `src/commands/serve.ts`: 確認者名欄の案内を「本人の名前（本番の動画は必須）」に変えた。
- `tests/production.test.ts`: 回帰試験を1件追加した（人名の判定、エージェント名の判定、本番での既定名・空白の拒否、本人名での承認）。
- `tickets/T104.md` と `docs/STATUS.md` を編集ツールで更新した。statusはdoneのまま。

## 判断と理由
- 方針（CHANNEL-POLICY、T104）では、本番の完成動画の承認は本人が行う。名前を省略したときの既定名は、誰が確認したか示せないので、本番では受け付けない。デモは動作確認のため、既定名でも従来どおり記録できる。
- 単語境界の変更で、`subagent` のように語の途中に agent を含む名前は一致しなくなる。これは人名の誤拒否を止めるための許容範囲とした。各AIが実際に名乗る名前（Claude Code、Codex、Antigravity/Gemini、test-agent、agentctl）は引き続き一致する。
- CLIの既定値 `cli-user` 自体は残した。デモの動作確認で使うため。本番では拒否されるので、すり抜けの穴は塞がっている。
- 定型作業評価: 新しいSkillの候補はない。

## 検証コマンド・結果・証跡
- 修正前: `./scripts/run --test tests/production.test.ts` の結果は pass 19 / fail 1、終了1。Magenta 等をエージェントと判定していた（evidence/before-fix.txt）。最初の版の試験は `ready()` の戻り値の扱いを誤っていたので直し、同じ失敗を再度保存した。
- 修正後: `./scripts/run --test tests/*.test.ts` の結果は 438 / pass 438 / fail 0、終了0（evidence/after-fix.txt。placeholder を変えたあとにも再実行した）。`tsc --noEmit` は終了0。

## 未実施・制約
- 名前は自己申告のままで、認証ではない（以前からの制約）。
- 確認画面を実ブラウザーで操作していない。HTTP経路は既存の試験で確認した。

## TODO・再開方法
- 次はT158（checkReadability が空・欠測の記録を合格にする問題）。
