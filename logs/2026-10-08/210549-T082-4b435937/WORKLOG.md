# 作業記録 T082
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
13件の実施依頼のうちT082（会話調の台本）。ローカル作業のみ

## 実施内容・変更ファイル
- src/lint.ts
  - 定数を追加した: CONVERSATIONAL（あなた、私たち、私、みなさん、一緒に、ましょう、ませんかなど）、STIFF_ENDING（である、だ、のだ）、STIFF_RATIO=0.3。
  - checkStructureの末尾に検査を追加した。
    - conversational-missing: ナレーション全体に語りかけ表現が1つもない。
    - stiff-style: 文（。！？と改行で区切る）のうち、である・だで終わる文が30%を超える。
  - どちらもwarningにした。
- prompts/script.md: 会話調（T082）の条件。
- tests/lint.test.ts（+1）。
- tickets/T082.md（done）、docs/STATUS.md。

## 判断と理由
- warningだけにした。会話調の効果（E7: 転移d=0.54）はメタ分析の根拠があるが、文字列の目安では文体を正しく判定できないため。errorにすると誤検出で制作が止まる。
- 「私」は一人称の語りとして数えた（会話調の研究は一人称・二人称の使用を含む）。
- fixtures/sample-v2.jsonは「あなた」を含み、です・ます調のため、変更していない。
- Skill化の評価: 見送る（新しい定型手順なし）。

## 検証コマンド・結果・証跡
証跡はevidence/verification.txtに保存した。
- `--test` → 86件成功。`tsc --noEmit` → エラー0。
- `lint --plan fixtures/sample-v2.json` → 指摘なし。
- `cli.ts lint`（v1） → conversational-missingを含むwarning 5。v1には語りかけ表現がない。
- 試験: 語りかけを除くとconversational-missingになる。である調ではstiff-styleになり、errorにならない。

## 未実施・制約
- 文体の自然さ、なれなれしさ、敬語の誤りは判定しない。

## TODO・再開方法
- 次はT083（用語の先出し説明）。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T083`。
