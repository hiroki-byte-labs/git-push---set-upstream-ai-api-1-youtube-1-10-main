# 作業記録 T083
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
13件の実施依頼のうちT083（用語の先出し説明）。ローカル作業のみ

## 実施内容・変更ファイル
- src/plan.ts
  - Term型とPlan.glossary?を追加した。LIMITSはterm 12、definition 40、glossary 30。
  - ROLESに'glossary'を追加した。用語の重複と長さを検証する。
- src/lint.ts（checkStructure）
  - 各用語について、見出し、ナレーション、字幕、図解の文言から初出の場面を探す。
  - glossary-unused: 初出がない。
  - glossary-late: 初出の場面までに、role=glossaryの場面でナレーションが用語を含むものも、「用語とは」と定義するナレーションもない。
  - どちらもwarningにした。
- prompts/script.md: 用語の先出し（T083）。
- fixtures/sample-v2.json: glossaryに「解釈」を追加した。場面3のナレーションを「解釈とは、見たことから自分が考えたことです。分けて書きましょう。あなたが最近見た事実は何でしたか？」（49字）にした。
- tests/lint.test.ts（+1）、tests/plan.test.ts（+1）。
- tickets/T083.md（done）、docs/STATUS.md。

## 判断と理由
- 説明の形を、専用の場面（role=glossary）と、その場の定義（「用語とは」）の2通り認めた。E15（事前学習の原理）の趣旨は「本編より前に用語を知らせる」ことで、短い動画で専用の場面を必須にすると冗長になるため。
- 初出の判定には図解の文言も含めた。画面に先に出る用語も、視聴者には初出になるため。
- 事前学習の効果の数値（d≈0.85）は二次情報のため、warningにとどめた。
- Skill化の評価: 見送る（新しい定型手順なし）。

## 検証コマンド・結果・証跡
証跡はevidence/verification.txtに保存した。
- `--test` → 88件成功。`tsc --noEmit` → エラー0。
- `lint --plan fixtures/sample-v2.json` → 指摘なし。
- `sample --plan fixtures/sample-v2.json` → bias-check-demo-389737d0、completed。
- 試験: 定義をなくすと「場面3で初めて出る」というglossary-lateになる。glossaryの場面で説明すると合格する。未使用の用語はglossary-unusedになる。

## 未実施・制約
- 用語集の網羅性（説明すべき用語の抽出）は自動化していない。台本の作成者が用語を登録する前提。
- 用語の表記ゆれ（例: 損切り／ロスカット）は検出しない。

## TODO・再開方法
- 次はT072（出典・立場の表示）。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T072`。
