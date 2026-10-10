# 作業記録 T014
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-08T20:10:18.079Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
エンハンス一括実施のうちT014（CLI分割、.node-version、チケット検査、媒体試験）。あわせてT014〜T016,T033,T041〜T044のチケットを作成。ローカル作業のみ

## 実施内容・変更ファイル
利用者の依頼「エンハンスをすべて実施し、引き継ぎログを作成」を受けた。調査で挙げた候補16件を、次のチケットに分けて作成した（作業回の開始前に作成し、本作業回で記録する）。
- T014: 開発基盤
- T041: 台本v2
- T042: 安全検査
- T043: 描画
- T044: 字幕と媒体検査
- T033: 承認プレビューとジョブ管理
- T016: 引き継ぎ文書
- T015: human。Gitの初回コミット（候補14）
- 候補5（T024の残件）は既存のT024で扱う。

本作業回の変更:
- src/cli.ts: 入口だけに縮小した（tickets、next、check、sample、serveの振り分け）。
- src/commands/sample.ts（新規）: 旧cli.tsのsampleとNativeVisualを移した。挙動は変えていない。
- src/commands/serve.ts（新規）: 旧cli.tsのserveを移した。挙動は変えていない。
- src/tickets.ts: sectionBody()を追加。必須の節が空なら拒否し、doneで「結果と検証証跡」が空・未実施・記入なら拒否する。
- tests/tickets.test.ts: 上の2つの試験を追加した。
- tests/media.test.ts（新規）: FFmpegがある場合に、lavfiで作った色画像と確認音から書出し・検査が通ること、無音の音声で検査が失敗することを試す。
- .node-version（新規、値は24）。scripts/runの案内文で.node-versionとNODE_BINを示す。
- tickets/T014.md（done）、T015、T016、T033、T041〜T044（新規）。

## 判断と理由
- 分割は挙動を変えないことを最優先にした。旧コードの処理順・出力文言を維持し、sampleの場面画像がバイト単位で一致することで確認した。
- 新しいモジュールは1文1行で書いた（読みやすさが候補16の目的のため）。既存のtickets.tsとworklog.tsは、差分を小さくするため従来の書式のままにした。
- チケットの状態遷移の検査は見送った。Gitに比較の基準となる履歴がないため。T015の初回コミット後に再検討する。
- NODE_BINの既定値は追加していない。端末固有の実行環境を自動で選ばない規約（ADR-008）を守るため。
- Skill化の評価（routine-to-skill）: 今回は「チケットごとに開始→実装→検証→記録→終了」を連続して行う。この流れは既存のrepository-task-closeoutで足りる。新規のSkillは作らない。

## 検証コマンド・結果・証跡
証跡はevidence/verification.txtに保存した。
- `./scripts/run --test tests/*.test.ts` → 36件成功・失敗0・skip 0。媒体の試験はFFmpegで実際に実行された。
- `./scripts/run node_modules/typescript/bin/tsc --noEmit` → エラー0。
- `./scripts/run src/cli.ts sample` → reflection-demo-ecdfd639。providersはlocal.appkit-ffmpeg。scene-1〜6のPNGは7f46324eとcmpで一致した。
- `cli.ts serve` → GET /が200、Range付きのGET /sample.mp4が206。
- `cli.ts tickets`と`next`は新しいチケット検査で全29件を受理した。

## 未実施・制約
- 状態遷移の検査は未実装（理由は判断の節に記載）。
- Windowsでの動作は未確認。
- FFmpegがない環境での媒体試験はskipになるため、その環境では書出しの検証にならない。

## TODO・再開方法
- 次はT041（台本v2）。順序はT041→T042→T043→T044→T024→T033→T016。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T041`。
