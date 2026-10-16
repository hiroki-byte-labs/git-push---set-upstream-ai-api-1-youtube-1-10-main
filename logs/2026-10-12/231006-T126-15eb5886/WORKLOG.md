# 作業記録 T126
- 記録者・実施者: Antigravity
- モデル: Gemini 3.8 Flash (High) (user-specified)
- 開始日時: 2026-10-12T23:10:06.165Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
- 依頼: 「T126も実施して下さい」
- 許可範囲: T126（Remotion描画を本体VisualProviderへ統合し場面テンプレートを描画する）の実装と検証。ローカルでのコンポーネント実装、パイプライン統合、隔離デモ案件によるMP4生成・媒体検査・レイアウト検査。外部有料API・契約・外部投稿は行わない。

## 実施内容・変更ファイル
1. **Remotionコンポジション・場面テンプレート実装 (`motion-lab/src/PlanVideo.tsx`)**:
   - `PlanVideo` および `SceneTemplate` コンポーネントを新規作成。
   - `calculateMetadata` 関数を定義し、入力Props（Plan）から動的に `durationInFrames`、`fps`、`width`、`height` を計算。
   - シーン種別に応じた視覚表現（ダーク背景 "Void" `#0b0f19`、円形グラデーション・スポットライト、`ProgressiveBar` メーター、フロー図カード＆矢印、比較・分岐カード、SVGピクトグラム `SilhouetteGroup`、焼き込み字幕配置）を実装。
2. **Root登録 (`motion-lab/src/Root.tsx`)**:
   - `PlanVideoComposition` を `<Composition>` として登録し、Remotion CLIから `calculateMetadata` 経由で任意Planを描画可能にした。
3. **本体VisualProvider実装 (`src/remotion-visual.ts`)**:
   - `RemotionVisual` クラスを新規作成し、`VisualProvider` インターフェース（`renderVideo`）に準拠。
   - `motion-lab/src/remotion-plan.ts` の `toRemotionPlanProps` を用いて Plan を Remotion props JSON へ変換。
   - `npx remotion render` を呼び出して映像MP4を出力し、ナレーション音声（`audio.wav`）と合成。
   - 代表フレーム（`scene-N.png`）およびサムネイル3案（`thumbnail-a/b/c.png`）の書き出し。
   - `render-report.json`（字幕領域の物理・論理座標）、`thumbnails-report.json`、`media-check.json` を出力。
4. **プロバイダ登録 (`src/providers.ts`)**:
   - `RemotionVisual` をエクスポート。
5. **CLIオプション追加 (`src/commands/sample.ts`, `src/commands/produce.ts`)**:
   - `cli.ts sample` および `cli.ts produce render` に `--renderer <native|remotion>` 引数を追加。
   - `--renderer remotion` 指定時に `RemotionVisual` を使用するように分岐。`job.json` の `versions` に `rendererKind: "remotion"` と `rendererSource: "motion-lab/src/PlanVideo.tsx"` を記録。

## 判断と理由
- **動的尺計算 (`calculateMetadata`) の導入**: Remotion CLI は静的 props なしで起動するとデフォルトの 300 フレームで終了してしまう制約があるため、コンポジション定義に `calculateMetadata` を付与し、入力 JSON から総フレーム数・解像度を動的に決定する設計とした。
- **Swiftレンダラーとの段階的併存**: 既存の `scripts/render.swift` を削除・置換せず、`--renderer remotion` を明示指定した際にのみ `RemotionVisual` を起動するオプトイン方式とすることで、macOSネイティブの既存テストと下位互換性を完全に維持した。
- **文字配置検査 (`checkLayout`) との幾何学的整合**: `render-report.json` における字幕領域の `box`（[45, 92, 1190, 128]、中心Y=156）に対し、実際に描画したテキスト矩形 `drawn`（[200, 136, 880, 40]、中心Y=156）の垂直中央を一致させ、`layout.ts` の許容誤差（1pt）を満たすように座標系を調整した。

## 検証コマンド・結果・証跡
- **隔離デモ動画生成**:
  - コマンド: `./scripts/run src/cli.ts sample --plan fixtures/sample-v2.json --renderer remotion --resolution 720`
  - 出力: `outputs/bias-check-demo-ee27087b/sample.mp4`（1280x720 24fps 48秒 1152フレーム、H.264/AAC）
  - 結果: fullDecode 正常終了（exit code 0）、文字配置検査 `checkLayout` 合格、見やすさ検査 `checkReadability` 合格、サムネイル3案出力確認。
  - 証跡: `logs/2026-10-12/231006-T126-15eb5886/evidence/remotion-sample-job.json`
- **全自動テスト実行**:
  - コマンド: `./scripts/run --test`
  - 結果: `ℹ tests 321, ℹ pass 321, ℹ fail 0`（全321件合格）
- **TypeScript型検査**:
  - コマンド: `npx tsc --noEmit && npx tsc -p motion-lab/tsconfig.json --noEmit`
  - 結果: エラー0件、合格

## 未実施・制約
- 長尺ナレーション音声・複数話者・詳細な音響効果（BGMダッキング等の高度なミキシング）の連携は後続チケット（T127）の対象。
- 外部APIへの接続・課金処理は利用者の明示指示に基づき行わない。

## TODO・再開方法
- 後続タスク: T127（長尺音声・字幕・音響パイプラインの統合）および T123〜T125のSkill実装。
- 再開時は `./scripts/run src/cli.ts next` で着手可能タスクを確認。

## 定型作業評価（routine-to-skill）
- 今回実施した「Remotionコンポジションの作成・VisualProvider統合・隔離デモ生成による媒体/レイアウト検査」の手順は、既存の `motion-reference-reproduction` Skill および `sample-render-verification` Skill の適用範囲内に整理されている。
- 今後のレンダラー追加・場面テンプレート拡充が発生した場合は `remotion-best-practices` と `sample-render-verification` の連携手順としてドキュメント化を検討するが、現時点では新規Skillの作成基準（3回以上の反復実証）には達していないため、既存Skill体系を維持する。
