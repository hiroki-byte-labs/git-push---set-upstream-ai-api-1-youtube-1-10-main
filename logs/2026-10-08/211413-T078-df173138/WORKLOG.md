# 作業記録 T078
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
13件の実施依頼のうちT078（全文字幕の重複回避、キーワード強調、既定をソフト字幕へ）。ローカル作業のみ

## 実施内容・変更ファイル
- src/commands/sample.ts: DEFAULT_SUBTITLES='soft'を追加した。NativeVisualとjob.subtitlesの既定に使う。
- src/media.ts: encode単体の既定（burn）はそのままにし、注記を付けた。sampleは字幕モードを必ず渡す。
- src/plan.ts: Scene.emphasis?（LIMITS.emphasisItemsは1〜3語、emphasisItemは12字）の検証を追加した。
- src/lint.ts: emphasis-unused（強調語がその場面のナレーションにない）をwarningにした。
- scripts/render.swift: emphasisの札を描く。枠はパネル色に2pxのアクセント色の縁、文字はアクセント色。
  - 字幕が焼き込みのとき: 字幕枠の上（y=198）に18pt。
  - 焼き込みでないとき: 字幕枠の位置（y=110）に28pt。
- fixtures/sample-v2.json: 各場面に、ナレーションに含まれる強調語を1〜2語追加した。
- docs/HANDOFF.md: 不変条件1を更新した（v1の比較は--subtitles burnで行う）。
- README.md: 字幕の既定の説明。
- tests/plan.test.ts（+1）、tests/lint.test.ts（+1）。
- tickets/T078.md（done）、docs/STATUS.md。

## 判断と理由
- 既定をsoftにした理由: E12（ナレーションと同じ全文を出すより、キーワードの方が有利）とE40（字幕は理解とアクセシビリティに有益）を両立するには、切り替え式の字幕と画面のキーワード表示の組み合わせがよいため。
- 互換への影響: 既定の変更で、引数なしのsampleは焼き込みなしになる。v1の見た目の互換は--subtitles burnで比較する形に、不変条件を更新した。M1と同じ設定（burn）での画像の一致は確認済み。
- 強調語の自動抽出はしない。誤った語を強調すると逆効果になりうるため、台本の作成者（またはAIの台本生成）が指定し、lintで整合性だけを見る。
- Skill化の評価: 見送る（新しい定型手順なし）。

## 検証コマンド・結果・証跡
証跡はevidence/（verification.txt、emphasis-soft-vs-burn.png）に保存した。
- `--test` → 104件成功。`tsc --noEmit` → エラー0。`swiftc -typecheck` → 成功。
- `sample --plan fixtures/sample-v2.json`（既定） → bias-check-demo-7181ae22。soft、字幕ストリーム1、1152フレーム、PSNR 39.7dB。
- 同じ台本で--subtitles burn → bias-check-demo-d60be8b6。字幕ストリーム0、1152フレーム、PSNR 39.6dB。
- 目視（emphasis-soft-vs-burn.png）: 場面3。softは大きな札（解釈、事実）、burnは字幕枠の上に小さな札。
- `sample --subtitles burn`（v1） → reflection-demo-27365093。scene-1〜6がM1と一致した。

## 未実施・制約
- burn時の札（y=198〜224）は、compareやnumberの図解の下端（y=225）に近く、余白が少ない。重なりはない。
- 強調語の妥当性は判定しない。

## TODO・再開方法
- 次はT079（注目を誘導する演出）。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T079`。
