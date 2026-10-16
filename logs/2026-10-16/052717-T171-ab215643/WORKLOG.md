# 作業記録 T171
- 記録者・実施者: Antigravity
- モデル: Gemini 3.8 Flash (Medium) (user-specified)
- 開始日時: 2026-10-16T05:27:17.530Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
- 依頼: 制作CLI（produce）への事実・権利確認パイプラインの統合と台本承認ブロック
- 許可範囲: `src/commands/produce.ts` の改修、テストコードの追加・更新、チケット・STATUS更新

## 実施内容・変更ファイル
- `src/commands/produce.ts`:
  - `PRODUCE_USAGE` に `produce fact-check <id> [--report レポート.json] [--by 名前]` を追加。
  - `printStatus` に事実確認状態（合格/要確認/未確認）の表示を追加。
  - サブコマンド `produce fact-check <id>` を実装。`--report` 指定時は指定ファイルを読み込み、未指定時は台本の出典（`plan.sources`）および自作素材権利情報から自動構築して `checkFactAndRights` で検証。案件ディレクトリに `fact-check.json` を保存し、`pipeline-manifest.json` の `fact-check` ステージを更新。
  - `produce script-review <id> approve` において、`fact-check.json`（または `fact-check-report.json`）が存在しない場合、あるいは `escalations`（要人確認・未検証）が残っている場合に例外をスローして承認を安全停止するガードを実装。承認成功時は `pipeline-manifest.json` の `script-review` ステージを `completed` に更新。
- `tests/produce-fact-check.test.ts`:
  - 事実確認レポート生成、事実確認未実施時の承認拒否、エスカレーション時の承認ブロック、正常レポートでの承認完了とパイプラインマニフェスト更新、差戻し（reject）動作、自動構成モードの単体テストを新規作成。
- `tests/production.test.ts`:
  - CLIパイプラインテストにおいて `script-review approve` の前に `fact-check` を呼ぶよう更新し、未実施時の承認拒否動作を回帰検証。
- `tickets/T171.md`: 実施結果を記載し `status: done` に更新。
- `docs/STATUS.md`: T171完了記録を追記。

## 判断と理由
- チケットの受入条件に従い、事実確認レポートが未作成の場合、またはエスカレーションが残っている場合には台本承認（approve）を厳格にブロックし、理由（未確認の主張や素材）を一覧表示して利用者に明示するようにした。一方、差戻し（reject）は事実確認の状態に関わらず常に実行可能とした。
- 定型作業評価（routine-to-skill）: 今回の作業はCLIサブコマンド追加と承認ガード実装という個別機能開発であり、独立して反復する定型手順ではないため、新規Skill作成は見送り既存手順（repository-task-closeout）を適用した。

## 検証コマンド・結果・証跡
- `./scripts/run --test tests/produce-fact-check.test.ts`: 1件パス（レポート生成、エスカレーション停止、正常承認、マニフェスト更新、差戻し）
- `./scripts/run --test tests/production.test.ts`: 18件全パス
- `npm run typecheck`: TypeScript型検査合格（エラー0）
- `npm test`: 全377件のテストスイート全件パス

## 未実施・制約
- 外部有料ファクトチェックAPIの呼出しやWeb自動クロールはチケット定義どおり対象外。

## TODO・再開方法
- 続けてT172（ローカルジョブキューの制作コマンドへのオプトイン接続）に着手する。
