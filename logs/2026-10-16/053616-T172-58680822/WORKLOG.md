# 作業記録 T172
- 記録者・実施者: Antigravity
- モデル: Gemini 3.8 Flash (Medium) (user-specified)
- 開始日時: 2026-10-16T05:36:16.252Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
ローカルジョブキューの制作コマンド（produce / sample）へのオプトイン接続
- 実施範囲: `src/commands/produce.ts` および `src/commands/sample.ts` に `--queue` オプションを追加し、`src/local-queue.ts` のローカルジョブキューへの投入・ワーカー実行・排他制御・進捗監視・完了通知を行うアダプター `src/queue-adapter.ts` を実装。単体テストを作成・検証。
- 対象外: 外部クラウドアダプター、分散キュー、有料クラウドリソース。

## 実施内容・変更ファイル
1. **`src/queue-adapter.ts` の新規実装**:
   - `openQueue`: 排他ロック（`owner.json`）の取得とポーリング待機リトライ、中断残骸プロセスの安全復旧（`recoverDeadOwner: true`）を実装。
   - `enqueueSample`: 台本ファイルの実在確認と通常ファイル検証を行い、安全なジョブIDで `LocalQueue.enqueue` に投入。
   - `enqueueProduce`: `LocalQueue.enqueueProduction` を呼び出し、制作案件の前提条件（台本承認済み等）を検証した上で投入。
   - `createQueueExecutor`: ステージ実行コンテキストから `result.json` を生成・保存（`writeArtifact` によるreceipt保証）。単体テスト等でモックランナーを差し替え可能な `overrides` をサポート。
   - `runSampleWithQueue` / `runProduceRenderWithQueue`: キューオープン、ジョブ登録、ワーカー実行（`drain`）、完了確認、結果抽出、制作案件への `linkRender` を一貫連携。
   - `processQueue`: 溜まったキューをワーカーとして一括処理するヘルパーを提供。
2. **`src/commands/sample.ts` の更新**:
   - `SampleOptions` に `queue?: boolean`, `queueDir?: string`, `concurrency?: number`, `maxAttempts?: number` を追加。
   - `parseSampleArgs` に `--queue`, `--queue-dir <path>`, `--concurrency <num>` の引数パースを追加。
   - `sample()` 関数の冒頭で `opts.queue === true` の場合に `runSampleWithQueue(opts)` へディスパッチ。
3. **`src/commands/produce.ts` の更新**:
   - `PRODUCE_USAGE` に `--queue`, `--queue-dir`, `--concurrency` を追記。
   - `sub === 'render'` において `opts.queue === true` の場合に `runProduceRenderWithQueue(root, id, opts)` へディスパッチ。
4. **`src/cli.ts` の更新**:
   - CLI help usage の `sample` コマンドに `--renderer native|remotion`, `--audio mock|say`, `--queue` を追記。
5. **`tests/queue-adapter.test.ts` の新規作成**:
   - CLI引数パース、`sample --queue` 正常系・receipt検証、`produce render <id> --queue` 前提条件検証・`workflow.renders`連携、concurrency=1 直列FIFO排他制御（maxActive=1）、concurrency=2 並行上限制御（maxActive=2）、障害時エラー記録（`status=failed`）の全6テストを作成。
6. **ドキュメント・チケット更新**:
   - `tickets/T172.md`: status を `done` に更新し、結果と検証証跡を記録。
   - `docs/STATUS.md`: T172の完了内容および次候補チケットを記録。

## 判断と理由
- **エグゼキュータ内とキュー完了後の責務分離**:
  - `LocalQueue` の `runJob` はステージ実行直後に `this.verify(j)` を呼び出し、制作案件の場合は `currentStage === 'render'` であることを再検証する契約になっている。もしエグゼキュータ内で `linkRender` を呼ぶと制作案件のレンダリング履歴が増加し `currentStage` が `'video-review'`（人間の動画承認待ち）に進むため、`verify(j)` が安全停止してしまう。
  - そこで、ステージ実行内では純粋にレンダリングを実行して成果物 `result.json` を出力することだけに専念させ、キューの `drain` が完了した直後に `runProduceRenderWithQueue` 側で `linkRender` を呼び出す構成とした。これにより `LocalQueue` の不変性検証契約と安全に整合した。
- **ロック競合時の待機リトライ**:
  - `LocalQueue` はファイルベースのシングルオーナーロック（`owner.json`）を採用しているため、直前のプロセスが drain 中である場合に即時クラッシュせず最大10秒間ポーリング待機するリトライループを `openQueue` に設けた。これにより、複数CLI呼出しや並行実行時の安定性を向上させた。

## 検証コマンド・結果・証跡
- `node --test tests/queue-adapter.test.ts`: 全6件合格（709ms）
  - parseSampleArgs parses --queue, --queue-dir, and --concurrency correctly
  - runSampleWithQueue executes sample via LocalQueue and persists verified state
  - runProduceRenderWithQueue checks prerequisites and links render on completion
  - FIFO queue serializes execution when concurrency is 1
  - concurrent queue respects concurrency limit of 2
  - failure records error and updates state safely
- `npm test`: 全383件テスト合格（16,506ms）
- `npm run typecheck`: エラー0件
- `./scripts/run src/cli.ts`: ヘルプ表示で `--queue` を含む最新 usage 出力を確認

## 定型作業評価（routine-to-skill）
- 今回の手順（既存の隔離実装済みモジュールをCLIオプトインオプション経由で接続し、排他制御・ライフサイクル・テストスイートを整備する作業）について評価。
- リポジトリ内には既に `repository-task-closeout` などのタスク管理SkillやRemotion検証用Skillが整備されている。
- 今回のキュー接続はT141固有の特定アダプター実装であり、汎用手順としての反復頻度は低く、新規Skill化の要件を満たさないため見送りとする。

## 未実施・制約
- クラウド分散キュー（SQS, Celery等）への外部接続はチケット対象外として未実施。手元のローカル永続ファイルキュー（`LocalQueue`）のみ接続。

## TODO・再開方法
- 次に着手可能なチケット:
  - T173: モバイル・縮小表示におけるサムネイル視認性の自動測定と品質検査ゲートの拡充（P2/M4/deps=T165,T167）
  - T174: 字幕（VTT）の文節・助詞境界に基づく自然な改行・cue分割最適化（P2/M4/deps=T154）
