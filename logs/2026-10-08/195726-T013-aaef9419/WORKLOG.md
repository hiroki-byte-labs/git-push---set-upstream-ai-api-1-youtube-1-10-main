# 作業記録 T013
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-08T19:57:26.425Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T013: T012レビュー指摘の修正。ローカル作業のみ、外部操作・課金なし

## 実施内容・変更ファイル
- src/tickets.ts: CRLFを受理。parseTicketFileでファイル名とidの一致を検査。
- src/worklog.ts: ファイル名検査を使うよう変更。finish時だけ、同一本文の節を拒否し、evidence参照の実在を確認。
- src/cli.ts: kindをlocal.appkit-ffmpegに変更。job.json.versionsを追加。render-sourceの欠落に対応。
- src/media.ts: ffmpegVersion()を追加。
- scripts/render.swift: 未使用のimportとfpsを除去。CVPixelBufferCreateの結果と引数数を検査。progress引数を除去し、装飾線を明示。
- scripts/verify（新規）、outputs/.gitkeep（新規）。
- tests/tickets.test.ts（+2）、tests/worklog.test.ts（+2。既存fixtureのfillを節ごとに異なる本文へ変更）。
- AGENTS.md、docs/AGENT-WORKFLOW.md、docs/DECISIONS.md（ADR-013）、docs/STATUS.md、README.md、tickets/T013.md。

## 判断と理由
- 新しいログ検査を過去ログに適用すると、T008のログがcheckで落ちる。規約で過去ログは改変できないため、finish時だけに適用した。
- 既存試験のfill()は全節が同じ本文だったため、新しい規則に合わせて節ごとに変えた。検査を緩める変更ではない。
- 進捗バーは静止画で常に全幅だった。見た目を変えないことを優先して装飾線として残し、PNGのハッシュ一致で確認した。
- pre-commitにテストを入れない判断はADR-013に記録した。
- Skill化の評価（routine-to-skill）: 今回は「レビュー指摘を修正チケットで消化する」流れの1回目で、反復の根拠がないため見送る。既存のrepository-task-closeoutで終了手順は足りている。再帰的な評価はしない。

## 検証コマンド・結果・証跡
- ./scripts/run --test tests/*.test.ts → 32件成功・失敗0。途中で、既存fixtureが同一本文のため9件失敗し、fixtureを修正した。
- tsc --noEmit → エラー0。
- cli.ts sample → reflection-demo-789ff307。job.jsonのprovidersがlocal.appkit-ffmpegになり、versionsが記録された。
- 6場面のPNGのSHA-256が旧ジョブ7f46324eと一致した。
- work/render-sourceを削除してsample → 5c5ac021が成功し、render-sourceが再生成された。
- 出力はevidence/verification.txtに保存した。finish後にscripts/verifyとcheckを実行する。

## 未実施・制約
- 指摘9（serveのID固定、全量読込、suffix range非対応）は対象外（M4）。
- media.encodeの単体試験は未追加。FFmpeg依存のため、sampleの実行で代替した。
- Windowsでの実機確認はしていない（CRLFは単体試験のみ）。
- 過去のjob.jsonの値は修正していない。

## TODO・再開方法
- T013は完了。次は人がT007、T025、T027、T031を実施し、agentはT024の残件を進める。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `next`。
