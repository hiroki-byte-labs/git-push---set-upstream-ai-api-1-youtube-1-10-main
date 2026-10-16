# 作業記録 T170
- 記録者・実施者: Antigravity
- モデル: Gemini 3.8 Flash (Medium) (user-specified)
- 開始日時: 2026-10-16T05:17:07.054Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
- 依頼: macOS標準音声（sayコマンド）を活用した無課金ローカル実ナレーション音声合成プロバイダーの実装
- 許可範囲: `src/local-say-audio.ts` の新設、`src/commands/sample.ts` / `src/commands/produce.ts` / `src/media.ts` の改修、新規テスト作成、チケット・STATUS更新

## 実施内容・変更ファイル
- `src/local-say-audio.ts`:
  - `LocalSayAudio` プロバイダー（kind: `local.say`、AudioProviderインターフェース実装）を新設。
  - macOS標準の `say` コマンド（Kyoko等）を呼び出し、24kHz/16bit/monoの標準RIFF/WAVEを生成。
  - `isSayAvailable()` および `getAvailableJapaneseVoices()` により実行環境での利用可否を判定。
  - `extractWavPcm`: `say` コマンドが出力するパディングチャンク（FLLR等）に対応したRIFF/WAVEチャンクパーサーを実装し、正確なPCMデータ・秒数・サンプルレートを取得。
  - `buildWav`: 24kHz/16bit/monoの標準44バイトヘッダーRIFF/WAVEを再構築。
  - `synthesizeTextWithSay`: 一時ファイル安全経由でテキストから実音声を合成。
  - `synthesizePlanWithSay`: Plan内の各シーン・cue単位で音声を合成し、各スライスの秒数枠に合わせてパディング・連結した全体のWAVバッファと各スライス実測所要時間情報を生成。文字数/秒数から適切なレート（WPM）を自動補助。
- `src/commands/sample.ts`:
  - `AudioMode` 型（`'mock' | 'say'`）および `--audio mock|say` 引数を追加。
  - `opts.audio === 'say'` の場合に `LocalSayAudio` をオプトインで使用。
  - `NativeVisual` に `narration` フラグを渡し、`media.ts` の `encode` へ連携。
- `src/commands/produce.ts`:
  - `PRODUCE_USAGE` に `[--audio mock|say]` オプションを追記。
- `src/media.ts`:
  - `EncodeOptions` に `narration?: boolean` を追加し、`media-check.json` の `narration` プロパティへ反映。
- `tests/local-say-audio.test.ts`:
  - `isSayAvailable` / `getAvailableJapaneseVoices` の動作検証
  - `extractWavPcm` と `buildWav` の往復整合性検証
  - `synthesizeTextWithSay` によるテキスト実音声合成とPCM・音量検証
  - `synthesizePlanWithSay` と `LocalSayAudio` によるPlan全体のWAV生成、秒数完全一致（48秒）、スライス分割・字幕同期・ダッキング計算との実データ連携、冒頭0.7秒の音声存在検証
  - `parseSampleArgs` における `--audio` 引数パースとバリデーション検証

## 判断と理由
- `say` コマンドが出力するWAVEファイルは先頭にFLLRチャンク（4044バイト）を含むため、固定44バイトオフセットと仮定せず、標準チャンクパーサー（`extractWavPcm`）を実装して正確にdataチャンクのPCMを抽出した。
- 動画制作パイプライン（`media.ts` の `encode`）では、全体の長さが `totalSeconds(plan)` と0.1秒以内で一致すること、および各シーン冒頭0.7秒に音声が存在することが要求される。そのため、各cueの枠（秒数）に対して実発話音声を配置し、余剰分は無音パディングすることで、台本全体の秒数とシーン冒頭音声を確実に満たす設計とした。
- 定型作業評価（routine-to-skill）: 今回の作業はmacOS sayコマンドを活用した実音声合成プロバイダーの新規モジュール実装であり、単発の機能開発であるため新規Skill作成は見送り、既存の終了・隔離検証手順（`repository-task-closeout`, `sample-render-verification`）を適用した。

## 検証コマンド・結果・証跡
- `./scripts/run --test tests/local-say-audio.test.ts`: 5件全パス
- 隔離検証（`/tmp/T170-verify-fixed`）:
  - `./scripts/run src/cli.ts sample --plan fixtures/sample-v2.json --audio say` を実行
  - `media-check.json`: expectedDuration 48s, decodedAudioDuration 48s, videoFrames 1152/1152, fullDecode: "passed", cuePeaks: [9784, 9522, 8030, 7882, 10362, 10492]（全6シーン冒頭に実音声あり）, PSNR最小 39.55 dB, integratedLufs -25.3 LUFS
  - AVPlayer実再生（`swift scripts/verify-avplayer-playback.swift /private/tmp/T170-verify-fixed/outputs/bias-check-demo-7e731cd8/sample.mp4 8 180`）: status: readyToPlay, durationSeconds: 48, ended: true（全編完走）
  - FFmpeg代表フレームタイル抽出（`tile-preview.png`）による目視確認完了
  - 元outputs（2,282件、latest.json）の完全保護を確認
- `npm run typecheck`: TypeScript型検査合格（エラー0）
- `npm test`: 全376件のテストスイート全件パス

## 未実施・制約
- 有料TTSサービス（ElevenLabs等）への契約・課金、非macOS環境での動作はチケット定義どおり対象外。

## TODO・再開方法
- T169・T170が完了。次の着手候補はT171（制作CLIへの事実・権利確認パイプライン統合）またはT172（ローカルジョブキュー接続）。
