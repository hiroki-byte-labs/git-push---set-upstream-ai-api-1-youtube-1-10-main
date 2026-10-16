# 作業記録 T175
- 記録者・実施者: Antigravity
- モデル: Gemini 3.8 Flash (Medium) (user-specified)
- 開始日時: 2026-10-16T06:40:25.564Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
長尺（10〜20分）制作ジョブにおけるリソース消費・メモリリーク・プロセス耐久性ベンチマークの整備
- 実施範囲: 長尺ダミー台本（10分・15分・20分）をプロシージャル生成し、隔離環境でレンダリングを実行して最大常駐メモリ（RSS）、ディスク使用量、所要時間、デコード完走可否を計測するテストスクリプト `scripts/benchmark-longform.ts` を作成。安全限界（メモリ上限3GB、ディスク上限500MB）を定義。単体テストを作成。
- 対象外: 本番YouTubeへの動画アップロード、実TTSによる有料音声合成。

## 実施内容・変更ファイル
1. **`scripts/benchmark-longform.ts` の新規実装**:
   - `generateLongformPlan`: 10分（14,400フレーム）、15分（21,600フレーム）、20分（28,800フレーム）の長尺Planを自動生成。flow, compare, number, branch, meterの全5種図解、6分以内の章立て、hook/question/example/recap/actionロール、beat構成、末尾免責事項を完全網羅し、`validatePlanV2` および `lintPlan`（error 0 / warning 0）に適合。
   - `runLongformBenchmark`: 隔離環境でプロセス実行中の最大常駐メモリ（RSS、100msインターバルサンプリング）、ディスク使用量（再帰バイト計算）、所要時間、処理スループット（fps / 倍速比）を計測。安全限界（最大RSS 3,072MB以下、最大ディスク 500MB以下）の合否判定を実施。
   - `--dry-run` モード: レンダリングを実行せずに台本バリデーションとリソース推計・安全限界チェックを高速実行。
   - 媒体検査連携: 生成動画のフレーム数一致検証、FFmpeg全編デコード（fullDecode）、AVPlayer実再生完走確認をサポート。
2. **`tests/benchmark-longform.test.ts` の新規作成**:
   - `generateLongformPlan` が10m/15m/20mの長尺台本を正しく生成しバリデーション・lintに合格することの検証。
   - 5種図解の網羅、章の連続性検証。
   - CLI引数パースの検証。
   - `runLongformBenchmark` dryRunでのレポート出力・閾値判定検証。
   - ディスク使用量再帰計算 `calculateDirSize` の検証。
3. **ドキュメント・チケット更新**:
   - `tickets/T175.md`: status を `done` に更新し、結果と検証証跡を記録。
   - `docs/STATUS.md`: T175の完了内容および次候補チケットを記録。

## 判断と理由
- **長尺台本の正式プロシージャル生成**:
  - 単なる繰り返しではなく、本番長尺の安全検査（lint）ルール（3分以上で必須となるhookの問い表現、intro概要欄導入文、章ごとのrecap/question、具体例exampleまたは物語beat、末尾免責事項）をすべて満たす正式なPlanを生成することで、実制作と同じ検査パイプラインを通したベンチマークを実現した。
- **dry-runによるCI/テスト高速化**:
  - 10〜20分の動画レンダリングは数分を要するため、通常テスト時やCI環境では `--dry-run` で台本構造・リソース推計・安全限界ロジックをミリ秒単位で高速検証できるようにした。

## 検証コマンド・結果・証跡
- `node --test tests/benchmark-longform.test.ts`: 全4件合格（75ms）
- `./scripts/run scripts/benchmark-longform.ts --minutes 10 --dry-run`: 正常終了（10分/14,400フレーム、レポートJSON出力確認）
- `npm test`: 全392件テスト合格（16,602ms）
- `npm run typecheck`: エラー0件

## 定型作業評価（routine-to-skill）
- 今回の手順（長尺レンダリングにおけるリソース消費・メモリ・耐久性ベンチマーク手順）について評価。
- リポジトリ内には既に `sample-render-verification` が存在し、短尺〜通常尺の実再生・フレーム目視確認をカバーしている。
- 今回整備した長尺ベンチマークはスクリプト（`scripts/benchmark-longform.ts`）として集約されており、CLIから単独実行可能であるため、現時点で独立した新規Skillを新設する必要はなく、スクリプトとして保守するのが最適と判断。

## 未実施・制約
- 本番YouTubeへのアップロード、有料TTSによる実音声合成はチケット対象外として未実施。

## TODO・再開方法
- 次に着手可能なチケット:
  - T176: Gitワーキングツリーの長期未コミット作業差分の段階的整理とコミット指針の策定
