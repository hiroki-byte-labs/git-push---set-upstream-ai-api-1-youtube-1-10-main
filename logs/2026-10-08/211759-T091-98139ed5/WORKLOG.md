# 作業記録 T091
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
13件の実施依頼のうちT091（1080p出力、最小文字サイズとコントラストの検査）。ローカル作業のみ

## 実施内容・変更ファイル
- scripts/render.swift
  - RenderSpec.scaleを読む。画素はw=1280×scale、h=720×scale。描画コンテキストをscaleByで拡大し、論理座標（1280×720）のまま描く。背景の塗りは論理座標の全面にした。
  - FitRecordにpixelSizeとcontrastを追加した。fitTextにbg引数（既定は背景色）を追加し、図解・字幕・強調の札・サムネイルでは実際の背景色を渡す。
- src/readability.ts（新規）
  - checkReadability(dir, scale)を追加した。基準は、720p換算の最小文字16pt（MIN_FONT_720、暫定）と、コントラスト比4.5（MIN_CONTRAST_TEXT、WCAG AA）。
  - 違反した文字を最大5件まで要約する。
- src/commands/sample.ts
  - --resolution 720|1080を追加した。NativeVisualがscaleを持ち、render-specに渡す。
  - job.resolutionとjob.readabilityを記録する（不合格でも制作は止めない）。
- src/commands/serve.ts: 詳細画面に「見やすさ」の節を追加した。
- src/cli.ts: 使い方を更新した。
- docs/OPERATIONS.md: 見やすさの確認の節（自動検査と、スマートフォン・テレビでの人の確認手順）を追加した。
- tests/readability.test.ts（新規、3件）。
- tickets/T091.md（done）、docs/STATUS.md。

## 判断と理由
- 1080pは「論理座標×拡大」で実装した。配置を720pと同一に保ち、描画のコードを二重に持たないため。文字はベクターで描くため、拡大してもにじまない（evidence/1080p-crop.pngで目視）。
- コントラスト比4.5はWCAGの基準（W3C）で、根拠が明確。最小文字16ptには研究の根拠を見つけられなかった。そのためコードと文書に「暫定」と明記し、人の実機確認で見直す手順を付けた。
- 既定の解像度は720pのままにした。既存のジョブ・試験・v1の互換を変えないため。本番は1080pを使うことを運用文書に書いた。
- 固定文字（text()で描くヘッダーの英字、場面番号、はい・いいえ、フッターの音声表記）は自動検査の対象外。いずれも17〜21ptで基準を満たすことを、コードで確認した。
- Skill化の評価: 見送る（新しい定型手順なし）。

## 検証コマンド・結果・証跡
証跡はevidence/（verification.txt、1080p-crop.png）に保存した。
- `--test` → 110件成功。`tsc --noEmit` → エラー0。`swiftc -typecheck` → 成功。
- `sample --plan fixtures/sample-v2.json --resolution 720` → bias-check-demo-f3af4dd7。読みやすさ合格（最小21pt、コントラスト比6.32）、1152フレーム、PSNR 38.8dB。PNG、サムネイル、動画はいずれも1280×720。
- `--resolution 1080` → bias-check-demo-df60b9f7。読みやすさ合格（720p換算は同値）、1152フレーム、PSNR 39.4dB。PNG、サムネイル、動画はいずれも1920×1080。
- `sample --subtitles burn`（v1） → reflection-demo-d416e345。scene-1〜6がM1と一致した。見やすさ合格（最小25pt、コントラスト比9.89）。
- 出典つき（T072の証跡の台本） → sourced-demo-216fb926。最小17pt（フッターの出典）で合格。

## 未実施・制約
- スマートフォンとテレビでの人の実機確認は未実施（手順はOPERATIONSに記載）。
- 4K（3840×2160）は対象外。
- 最小16ptは暫定値。

## TODO・再開方法
- 次はT086（題材選びの調査方法）。サブエージェントの調査結果を文書化する。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T086`。
