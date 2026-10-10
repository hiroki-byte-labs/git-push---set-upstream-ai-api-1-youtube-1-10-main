# 作業記録 T097
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-10T06:08:48.308Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T097: docs/CLAUDE-REPAIR-INSTRUCTIONS.mdに従い、最終場面の免責を単語の有無でなく否定文として判定し、肯定の推奨・保証を拒否する。隔離回帰試験と記録を完了する。有料API・push・投稿は行わない

## 実施内容・変更ファイル
- 開始前: T096の作業回終了後に `check` OK（35 sessions）。読んだもの: tickets/T097、src/lint.tsの免責とFORBIDDEN、src/channel.ts、config/channel.json、fixtures/sample.json・sample-v2.jsonの最終場面、src/plan.tsのv1変換（narration＝subtitle）、prompts/script.md、tests/lint.test.ts、T093 REVIEW.md指摘4。
- tests/lint.test.ts: 表形式の免責試験12件を先に追加し、未修正で4件失敗を確認した（肯定・併存・一文混在・片側のみ）。
- src/lint.ts: checkDisclaimer（文末否定の判定）を追加し、最終場面の免責検査をナレーションと字幕で別々に行うよう変更。新規rule disclaimer-affirmative。
- prompts/script.md: 免責の書き方（T097）を追記。docs/HANDOFF.md: T042の行を更新。
- tickets/T097.md（done）、docs/STATUS.md。

## 判断と理由
- 固定免責の挿入/照合ではなく、許容文言の判定を選んだ。既存のv1/v2サンプルと、config/channel.jsonの免責文（「推奨や利益の保証をするものではありません」）の言い回しが異なり、固定文にすると両方の変更が必要になるため。文末否定という小さく説明できる規則にした。
- 日本語は述語が文末に来るため、文末が否定かどうかで肯定/否定を分ける。「推奨はしませんが、保証します」は文末が肯定なので拒否される（混在の見逃しを避ける保守的な扱い）。
- 否定の文末は「ません／ない／ないです」に限定した。最初に「なく」なども入れたが、「推奨ではなく」のような途中の句を免責と誤判定しうるため外した。
- ナレーションと字幕の両方を必須にした。音声を聞かない視聴者と字幕を見ない視聴者の両方に免責を届けるため。現行の両サンプルは両方に免責があり、変更は不要だった。
- 最終場面の肯定の「保証」（例: 元本は保証します）もerrorにした。免責の場面で肯定の保証表現を許す必要はなく、見逃しを減らす方を選んだ。他の場面はFORBIDDENの既存規則のまま。

## 検証コマンド・結果・証跡
- `./scripts/run --test tests/lint.test.ts`（修正前）: tests 31 / pass 27 / fail 4、終了コード1。evidence/before-fix.txt。
- `./scripts/run --test tests/lint.test.ts tests/plan.test.ts tests/thumbnails.test.ts tests/channel.test.ts tests/metadata.test.ts`（修正後）: tests 66 / pass 66 / fail 0、終了コード0。evidence/after-fix.txt。
- `./scripts/run node_modules/typescript/bin/tsc --noEmit`: 出力なし、終了コード0。evidence/typecheck.txt。
- `./scripts/run src/cli.ts lint --plan fixtures/sample.json` / `sample-v2.json`: どちらもerror 0、終了コード0。v1のwarning 5件は構成ルール（promise・hook等）で、免責とは無関係の従来の指摘。evidence/fixtures-lint.txt。
- finish後に `cli.ts check` と `next` を実行する。

## 未実施・制約
- 文末の否定だけを見る機械的な規則であり、意味理解や法的適合性の保証ではない。二重否定や婉曲表現（「推奨しないわけではありません」など）は正しく扱えない。
- 動画の再生成はしていない（lintだけの変更で、既存サンプルの判定結果は変わらない）。
- Skill化の評価: 指示書の手順どおりで新しい反復はない。全体の評価はT099で行う。今回は見送る。

## TODO・再開方法
- 次はT098（再試行時の費用不明額）を新しい作業回でstartする。
- 再開: NODE_BINを指定 → `./scripts/run src/cli.ts check` → `next`。
