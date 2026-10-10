# 作業記録 T075
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
13件の実施依頼のうちT075（冒頭30秒の構成ルール）。ローカル作業のみ

## 実施内容・変更ファイル
- src/plan.ts
  - ROLES（今回は'hook'と'body'。以後のチケットで追加する）、Role型、Scene.role?、Plan.promise?（LIMITS.promise=40）を追加した。
  - 不正なroleと長すぎるpromiseを拒否する。
- src/lint.ts
  - LONG_FORM_SECONDS=180、HOOK_WITHIN_SECONDS=30を追加した。
  - checkStructure()を追加した。規則はpromise-missing、hook-missing（冒頭30秒以内に始まる場面にhookがない）、hook-question（hookのナレーションに？がない）。
  - 重大度は、総尺が3分以上ならerror、未満ならwarning。
- prompts/script.md: 「構成の条件」の節と、冒頭（T075）を追加した。
- fixtures/sample-v2.json: promiseを追加し、場面1をrole=hook、問いを含むナレーション（53字、8秒×9字以内）にした。
- tests/lint.test.ts（+2）、tests/plan.test.ts（+1）。
- tickets/T075.md（done）、docs/STATUS.md。

## 判断と理由
- 厳しさを総尺で分けた。M1の36秒の試作（v1）を壊さず、本番の長尺では確実に止めるため。3分は「本番の長尺（10〜20分）と、試作・ショートの境目」として置いた仮の値で、研究の根拠はない。
- 冒頭3秒・30秒の離脱率の数値基準は採用しなかった。教育動画での査読根拠が未確認のため（RESEARCH-GROWTH 5章）。G18（YouTube公式: 冒頭30秒が期待との一致を反映する）とE28（好奇心）に基づき、「30秒以内に問いと約束を置く」という構造の規則にした。
- promiseとタイトルの意味的な一致は自動では判定できない。T074（メタデータ生成）で、promiseからタイトル案を作ることで一致させる。
- Skill化の評価: 新しい定型手順はない。見送る。

## 検証コマンド・結果・証跡
証跡はevidence/verification.txtに保存した。
- `--test` → 80件成功。`tsc --noEmit` → エラー0。
- `cli.ts lint`（v1、36秒） → warning 2（promise-missing、hook-missing）で、ok。
- `lint --plan fixtures/sample-v2.json` → 指摘なし。
- `sample --plan fixtures/sample-v2.json` → bias-check-demo-8816057c。completed、lintはerror 0 / warning 0。
- 試験: 30秒より後のhookは数えないこと、本番尺（240秒）ではpromise-missingがerrorになりok=falseになること。

## 未実施・制約
- タイトル・サムネイルとpromiseの一致は未検査（T073、T074）。
- 問いの判定は「？」の有無だけで、問いの質は判定しない。

## TODO・再開方法
- 次はT080（章立てと途中のまとめ・問いかけ）。ROLESにrecapとquestionを追加する。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T080`。
