# 作業記録 T117
- 記録者・実施者: Antigravity
- モデル: Gemini 3.8 Flash (High) (user-specified)
- 開始日時: 2026-10-12T10:14:51.883Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
- 依頼: docs/AUTONOMOUS-DOCUMENTARY-PIPELINE.md 第4章の事前準備タスク実施、およびT117（motion-lab描画エンジンと本体制作パイプラインの統合方式の設計・ADR策定）。
- 許可範囲: ローカルコード・アセットの作成、単体テスト・型検査の実施、チケット（T117）および設計記録（docs/DECISIONS.md ADR-021）の更新。
- 範囲外: 有料API利用、著作権保護対象の無断取得、実動画投稿、Git push、外部契約。

## 実施内容・変更ファイル
1. SVGピクトグラム集の作成 (`assets/pictograms/`):
   - `person.svg`: 人型シルエット
   - `crown.svg`: 王冠（勝者・報酬シンボル）
   - `scale.svg`: 天秤（比較・対比シンボル）
   - `coin-stack.svg`: コインの山（格差・報酬）
   - `arrow-trend.svg`: 上昇トレンド矢印
2. Remotion共通プリミティブコンポーネント集の実装 (`motion-lab/src/primitives/`):
   - `icons.tsx`: 上記SVG群をReact/Remotionで利用するためのラッパー
   - `VoidBackground.tsx`: 暗黒空間（#0a0a0c）と微細な放射状グロー
   - `Spotlight.tsx`: 動的スポットライト（中心位置・半径・強度）
   - `ProgressiveBar.tsx`: cubic-bezierによる滑らかな棒グラフ・比較アニメーション
   - `SilhouetteGroup.tsx`: 人型シルエット配列と特定対象へのスポットライト演出
   - `BurnInSubtitle.tsx`: 洗練された枠なし焼き込み字幕
   - `index.ts`: バレルエクスポート
3. 台本データとRemotion Propsの変換モジュール実装 (`motion-lab/src/remotion-plan.ts`):
   - `RemotionPlanProps`, `RemotionSceneProps`, `RemotionCueProps` の型定義
   - `toRemotionPlanProps(plan: Plan)` による変換関数
4. 単体テストの実装 (`motion-lab/tests/remotion-plan.test.ts`):
   - 台本JSONからRemotion Propsへの正常変換・時間計算・構造検証
5. アンビエントBGM仕様の策定 (`assets/audio/bgm/bgm.json`):
   - ターゲット音量（-14 LUFS）、ダッキング減衰量（-18 dB）、推奨プリセット（deep-inquiry, paradox-tension, philosophical-resolution）の仕様化
6. 統合方式設計判断（ADR）の策定 (`docs/DECISIONS.md`):
   - `ADR-021`: motion-lab描画エンジンRemotionと本体制作パイプラインの統合方式（選定理由、アーキテクチャ、移行ロードマップ）
7. 設定・環境整備:
   - `motion-lab/tsconfig.json`: `target: "ES2022"`, `lib: ["es2022", "dom"]` へ更新（`Array.prototype.at()` 型解決対応）
8. チケットおよびステータス更新:
   - `tickets/T117.md`: statusをdoneへ更新、成果物・検証証跡を記録
   - `docs/STATUS.md`: T117完了エントリを追記
9. 定型作業のSkill化評価 (`.agents/skills/routine-to-skill/SKILL.md`):
   - 今回実施した事前準備タスクおよび統合設計について評価。Remotionのベストプラクティスは既存Skill（`remotion-best-practices`, `motion-reference-reproduction`）でカバーされており、本次期作業固有のProps変換・プリミティブ作成は初期基盤整備（単発設計・実装）であるため、反復の根拠が不足しており新規Skill化は見送りとした。

## 判断と理由
- **Swift/AppKitからRemotionへの段階的移行 (ADR-021)**:
  - 現行のSwiftレンダラー（`scripts/render.swift`）はmacOSネイティブ依存が高く、Linux/クラウド実行やエコシステム拡張性に制約がある。
  - RemotionはReact/Web標準を活用でき、motion-labでの検証資産を直接制作パイプラインへ再利用可能であるため、本体レンダラーの次期中核として採用することを決定。
- **Remotionプリミティブの抽象度**:
  - 特定の動画シーンに特化しすぎず、ドキュメンタリー全般で再利用可能な低レベル視覚要素（VoidBackground, Spotlight, ProgressiveBar, SilhouetteGroup, BurnInSubtitle）として分離・実装。
- **BGMファイルの実態非コミット**:
  - 音源ファイル本体はGitリポジトリの肥大化および著作権・ライセンス遵守の観点からGit管理外とし、音響特性・ミキシング規則を宣言するJSON仕様（`assets/audio/bgm/bgm.json`）を整備。

## 検証コマンド・結果・証跡
- `./scripts/run --test motion-lab/tests/remotion-plan.test.ts`
  - 結果: 1 pass, 0 fail (TEST_EXIT=0)
  - 証跡: `evidence/remotion-plan-test-output.txt`
- `./scripts/run node_modules/typescript/bin/tsc --noEmit`
  - 結果: ROOT_TSC_EXIT=0
  - 証跡: `evidence/typecheck-output.txt`
- `./scripts/run node_modules/typescript/bin/tsc --noEmit -p motion-lab/tsconfig.json`
  - 結果: MOTION_LAB_TSC_EXIT=0
  - 証跡: `evidence/typecheck-output.txt`
- `./scripts/run --test`
  - 結果: 315 tests pass, 0 fail (EXIT=0)
- 成果物マニフェスト:
  - 証跡: `evidence/primitives-manifest.md`

## 未実施・制約
- `cli.ts produce` へのRemotionレンダラー結合は後続タスク T118 の範囲であるため未実施。
- 商用BGM音源の実ファイル配置はライセンス取得および利用者の手動配置待ち（仕様定義のみ完了）。
- 外部API呼び出し、動画投稿、Git push、有料機能の実行は規約に従い未実施。

## TODO・再開方法
- 再開手順:
  ```sh
  ./scripts/run src/cli.ts check
  ./scripts/run src/cli.ts next
  ./scripts/run src/worklog-cli.ts start T118 --agent Antigravity --model "Gemini 3.8 Flash (High)" --model-source user-specified --request "Remotionレンダラーを本体制作パイプライン（cli.ts produce）に正式統合する"
  ```
- 次の作業候補:
  - T118: Remotionレンダラーの本体制作パイプライン（`cli.ts produce`）への正式統合、およびレイアウト自動検査の実装。
  - T106: 構成案・動き・サムネイル・字幕形式方針（`docs/REFERENCE-STYLE-POLICY.md`）の利用者レビュー待ち対応。
