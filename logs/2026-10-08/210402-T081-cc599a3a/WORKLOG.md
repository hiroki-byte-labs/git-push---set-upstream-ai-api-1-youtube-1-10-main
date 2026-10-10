# 作業記録 T081
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
13件の実施依頼のうちT081（物語の構成と具体例、架空例の明示）。ローカル作業のみ

## 実施内容・変更ファイル
- src/plan.ts
  - ROLESに'example'を追加した。
  - BEATS（situation、conflict、insight、lesson）とBeat型、Scene.beat?、Scene.fictional?（真偽値）を追加した。
  - 不正な値を拒否する。
- src/lint.ts（checkStructureに追加）
  - story-missing: exampleもbeatもない場合。本番尺ではerror。
  - example-label: 出来事を語る場面（role=example、beat=situation、beat=conflict）に、fictional:trueも出典もない場合。総尺に関係なく常にerror。
  - example-unmarked: 「例えば／たとえば」を含むのに、exampleでもbeatでもなく、架空表示も出典もない場合。warning。
  - story-order: beatの順序違い。warning。
  - story-incomplete: situation、conflict、lessonのどれかが欠けている場合。warning。
- scripts/render.swift: Scene.fictionalをデコードする。trueなら右上に「架空の例」の札を描く（rect 1060,592,160×34、文字20pt）。
- prompts/script.md: 物語と具体例（T081）の条件。
- fixtures/sample-v2.json
  - 場面2: example、situation、fictional。
  - 場面3: conflict、fictional。
  - 場面5: insight。
  - 場面6: lesson。
- tests/lint.test.ts（+2）、tests/plan.test.ts（+1）。
- tickets/T081.md（done）、docs/STATUS.md。

## 判断と理由
- example-labelは常にerrorにした。事実・解釈・架空例の区別は、台本の条件の根幹で、金融の文脈で誤認を招くため（prompts/script.md、E35〜E37）。
- 最初の実装では、beatを持つすべての場面をexample-labelの対象にしたため、一般化の場面（insight、lesson）までerrorになり、試験が5件失敗した。出来事を語る場面（example、situation、conflict）だけに対象を絞って直した。
- 「架空の例」の札は、最初の描画で文字が枠の上にはみ出した（y=560）。目視で見つけ、y=525に直した（evidence/fictional-label.pngが修正前、fictional-label-fixed.pngが修正後）。
- 本筋と無関係な逸話の禁止は、自動判定できないため、指示文と演出の指針（T085）で扱う。
- Skill化の評価: 見送る（新しい定型手順なし）。

## 検証コマンド・結果・証跡
証跡はevidence/に保存した。
- `--test` → 85件成功。`tsc --noEmit` → エラー0。
- `lint --plan fixtures/sample-v2.json` → 指摘なし。
- `sample --plan fixtures/sample-v2.json` → 修正前はd71fb6a5、修正後は7ca555a9。completed、1152フレーム、PSNR 39.8dB。
- `cli.ts sample`（v1） → reflection-demo-9731bf01。scene-1〜6がM1と一致した（札の位置修正は、fictionalのない台本に影響しない）。
- 試験: 架空表示をやめるとerror（ok=false）、出典を付けると解消する。「例えば」の未指定、順序違い、欠落、物語なしを検出する。

## 未実施・制約
- 物語の質や、本筋との関連性は判定しない。
- 実在の人物・銘柄の検出はlintの既存規則（specific-security）の範囲に限られる。

## TODO・再開方法
- 次はT082（会話調）。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T082`。
