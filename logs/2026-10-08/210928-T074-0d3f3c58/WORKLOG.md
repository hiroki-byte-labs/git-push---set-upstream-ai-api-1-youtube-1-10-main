# 作業記録 T074
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
13件の実施依頼のうちT074（タイトル・概要欄・チャプターの生成と公開後の見直し記録）。YouTubeへの反映はしない。ローカル作業のみ

## 実施内容・変更ファイル
- src/metadata.ts（新規）
  - YT定数: タイトル100、概要欄5000バイト、タグ500、チャプター3つ以上・各10秒以上。
  - 関数: timestamp、tagsLength（APIの数え方）、checkTitle、buildMetadata、reviseTitle。
  - buildMetadataの出力: タイトル案3種、概要欄（分かること、チャプター、用語、出典、立場・免責）、タグ、チャプター。チャプターを出さない場合はchaptersOmittedに理由を残す。
  - 本番尺（3分以上）でチャプターがなければissueにする。
- src/lint.ts: lintText()を追加した。台本以外の文言に禁止表現の規則を当てる。
- src/commands/sample.ts: metadata.jsonを出力し、job.metadataに{ok, issues, chapters}を記録する。問題があっても制作は止めない。
- src/cli.ts: `metadata <id>`（表示）と`metadata <id> revise --title --reason [--by]`（見直しの記録）を追加した。
- src/commands/serve.ts: 詳細画面に「タイトル・概要欄」の節を追加した。
- docs/RESEARCH-GROWTH.md: 6章「実装の基準にしたYouTube公式仕様」を追加した（T086のサブエージェント調査の結果）。
- tests/metadata.test.ts（新規、8件）。
- tickets/T074.md（done）、docs/STATUS.md。

## 判断と理由
- 上限値は、T086用に依頼したサブエージェントの公式資料調査に基づく。概要欄はAPIの「5000バイト」で判定した（ヘルプの5,000文字より厳しく、API経由の投稿で失敗しないため）。
- タイトル案は台本の文言（題名、promise、hookの問い）から作った。中身とタイトルを一致させるため（G18）。煽りの生成はしない。禁止表現はlintTextで落とす。
- メタデータの問題で制作は止めず、job.jsonと確認画面に出す。公開前の人の確認（T032の承認）で直す運用にした。
- 試験の期待値の誤り: 同梱v2の導入章・まとめ章は8秒で、YouTubeの「各チャプター10秒以上」を満たさない。最初の試験は4チャプターを期待して2件失敗した。仕様どおりの挙動のため、試験側で尺を1.5倍にする形に直した。同梱v2では理由付きでチャプターを出さないことも試験した。
- エージェントの動作確認による記録: chaptered-demo-85d86771のタイトル見直しは、エージェントが動作確認のために行った。reasonとbyに明記した（by=Claude Code）。
- Skill化の評価: 見送る（新しい定型手順なし）。

## 検証コマンド・結果・証跡
証跡はevidence/（verification.txt、chaptered-plan.json）に保存した。
- `--test` → 99件成功。`tsc --noEmit` → エラー0。
- `sample --plan scratchpad/chaptered.json`（v2の尺を1.5倍） → chaptered-demo-85d86771。job.metadata.ok=true、チャプター4つ（00:00、00:12、00:36、01:00）。
- `cli.ts metadata <id>`で、タイトル候補3つと概要欄全文を表示した。
- revise: 理由なしと「必ず儲かる…」は拒否された。正しい見直しは記録された。
- 同梱v2（bias-check-demo-84da5bbc）: チャプターなし（理由「10秒未満の章がある」）、概要欄775バイト。
- 確認画面: 見直し後のタイトルとチャプター行が表示された（curl）。

## 未実施・制約
- YouTubeへの反映（タイトル、概要欄、チャプター、タグの設定）はT032で行う。
- AI利用と人の監修の表示はT071で行う（概要欄への追加）。
- サムネイルの見直し履歴は、T073で同じ仕組みに足す余地がある（今回はタイトルのみ）。
- 公式仕様は要約取得で、原文の逐語確認は未実施。

## TODO・再開方法
- 次はT073（サムネイル）。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T073`。
