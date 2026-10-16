# 事前準備タスク成果物マニフェスト

## 1. SVGピクトグラム集 (`assets/pictograms/`)
- `person.svg`: 人型シルエット
- `crown.svg`: 王冠（勝者・報酬シンボル）
- `scale.svg`: 天秤（比較・対比シンボル）
- `coin-stack.svg`: コインの山（格差・報酬）
- `arrow-trend.svg`: 上昇トレンド矢印

## 2. Remotionプリミティブコンポーネント集 (`motion-lab/src/primitives/`)
- `icons.tsx`: 上記SVGをReact/Remotionで描画するIconコンポーネント群
- `VoidBackground.tsx`: 暗黒空間（#0a0a0c）と微細な放射グラデーション
- `Spotlight.tsx`: 動的スポットライト（中心・半径・強度）
- `ProgressiveBar.tsx`: cubic-bezierで滑らかに伸びる比較・棒グラフ
- `SilhouetteGroup.tsx`: 人型シルエット配列と単一勝者ハイライト
- `BurnInSubtitle.tsx`: 洗練された枠なし焼き込み字幕

## 3. アンビエントBGM仕様 (`assets/audio/bgm/bgm.json`)
- ターゲット音量: -14 LUFS
- ダッキング減衰量: -18 dB
- 3種の推奨アンビエントプリセット（deep-inquiry, paradox-tension, philosophical-resolution）

## 4. 台本マッピング (`motion-lab/src/remotion-plan.ts`)
- `Plan` から `RemotionPlanProps` への変換関数 `toRemotionPlanProps`
- `RemotionSceneProps`, `RemotionCueProps`
