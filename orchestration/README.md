# 3製品エージェント連携オーケストレーション（orchestration/）

本ディレクトリは、Claude Code、Codex、Antigravity（Gemini）の3製品11ロールが協調して参考動画の解析・Remotionコード生成・フレーム測定・差異改善を行う協調ワークフローの自動オーケストレーション基盤です。

## 概要

- **設定ファイル**:
  - `workflow.json`: ステージ進行定義、成果物スキーマ、許可ロール、終了条件
  - `roles.json`: 3製品にまたがる全11ロールの責務と実行製品マッピング
  - `thresholds.json`: 定量判定閾値（位置・サイズ・変位・色差・加速度差等）
- **主要モジュール**:
  - `engine.ts`: ワークフロー進行、成果物スキーマ検証（Ajv）、ロール権限検査、改善ループ制御
  - `lab-adapter.ts`: motion-lab との連携（FFmpegフレーム切り出し、Remotionレンダリング、測定データ集約）
  - `judge.ts`: 測定結果の定量合否判定（`quantitative_review`）
  - `demo.ts`: 単体パイプライン実行デモ
  - `e2e.test.ts`: 全11ロール・全停止条件の自動統合試験

## CI / ローカルでのテスト実行手順

### 前提条件
- Node.js 24+ (`node -v`)
- pnpm (`pnpm -v`)
- FFmpeg 6+ (`ffmpeg -version`)
- motion-lab 依存関係 (`pnpm install --dir motion-lab`)

### 自動テスト実行コマンド

1. **オーケストレーション単体・統合テストの実行**:
   ```bash
   ./scripts/run --test orchestration/*.test.ts
   ```

2. **全リポジトリテストの実行**:
   ```bash
   ./scripts/run --test
   ```

3. **TypeScript型検査**:
   ```bash
   ./scripts/run node_modules/typescript/bin/tsc --noEmit
   ./scripts/run node_modules/typescript/bin/tsc -p motion-lab/tsconfig.json --noEmit
   ```

## 統合テスト（`e2e.test.ts`）で検証されるシナリオ

1. **正常系フルサイクル（収束完了）**:
   - 合成参考動画（`makeReference`）を入力とし、11ロールが順次ハンドオフを実施。
   - rev 0 での不備検出（位置誤差）→ 修正タスク発行 → rev 1 での修正 Remotion 生成 → 再測定合格 → 定性レビュー合格 → `status: complete` へ到達。
   - 各ステージで `schemas/*.schema.json` に準拠した成果物が生成・検証されること。
2. **上限到達による安全停止（`stop_limit`）**:
   - `max_improvements: 2` 回の改善試行後も閾値未達の場合、無限ループせず自動停止。
3. **悪化・停滞による安全停止（`stop_no_improvement`）**:
   - 改善試行で指標が悪化した場合、無駄な試行を継続せず停止。
4. **観測不能・情報不足による安全停止（`stop_inconclusive`）**:
   - 参照動画の利用可能性や観測根拠が欠如している場合、実装を強行せず停止。
