# 作業記録 T080
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
13件の実施依頼のうちT080（章立てと途中のまとめ・問いかけ）。ローカル作業のみ

## 実施内容・変更ファイル
- src/plan.ts
  - ROLESにrecapとquestionを追加した。Scene.chapter?（LIMITS.chapter=24）を追加した。
  - 章の検証: 一部の場面だけに付けることを禁止し、同じ章が離れて再登場することを禁止する。
  - chaptersOf(plan)を追加した。{index, title, startSeconds, seconds, scenes[]}の配列を返す。
- src/lint.ts
  - CHAPTER_MAX_SECONDS=360を追加した。
  - 規則: chapter-missing（本番尺はerror）、chapter-too-long（warning）、chapter-recap（2章以上で、hookを含まない章にrecapもquestionもなければwarning）。
- scripts/render.swift: Scene.chapterをデコードする。chapterLabel()で「第N章 章名」を計算し、ヘッダーに表示する（fitText、21pt、高さ30）。章がなければ従来の英字ヘッダーにする。
- prompts/script.md: 章立て（T080）の条件。
- fixtures/sample-v2.json: 4章（導入、気持ちと事実、確かめ方、まとめ）。場面3と5をquestionにして問いのナレーションへ変更し、場面6をrecapにした。
- tests/plan.test.ts（+1）、tests/lint.test.ts（+1）。
- tickets/T080.md（done）、docs/STATUS.md。

## 判断と理由
- 6分の目安はE1（Guo 2014: 視聴時間の中央値は最大約6分）による。MOOCのデータのため、errorではなくwarningにした。
- 章のない本番尺をerrorにした理由: 10〜20分を一続きにすると、チャプター（T074）も分割の効果（E14）も得られないため。
- 導入章（hookを含む章）は、まとめ・問いの規則から外した。冒頭は問いで始まるため。
- 試験データの誤り: 最初に書いた「長すぎる章」の試験は、どの章も6分を超えない設定になっていて失敗した。4場面を同じ章「本編」にまとめて480秒にする形に直した。コードの不具合ではない。
- Skill化の評価: 見送る（新しい定型手順なし）。

## 検証コマンド・結果・証跡
証跡はevidence/に保存した。
- `--test` → 82件成功。`tsc --noEmit` → エラー0。
- `cli.ts sample`（v1） → reflection-demo-5a410dbe。scene-1〜6がM1（7f46324e）と一致し、章なしの台本の見た目は変わらなかった。
- `sample --plan fixtures/sample-v2.json` → bias-check-demo-c8fb881d。completed、1152フレーム、PSNR最小39.9dB、lint指摘0。
- 目視: chapters.png（6場面の完成状態。第1〜4章のヘッダーを確認した）。
- `cli.ts lint`（v1） → warning 3（promise、hook、chapter）。

## 未実施・制約
- 章の長さは目安で、学習成果の保証ではない。
- 問いかけの場面に対する視聴者の回答を集める仕組みはない（YouTubeの機能の範囲外）。

## TODO・再開方法
- 次はT081（物語の構成と具体例）。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T081`。
