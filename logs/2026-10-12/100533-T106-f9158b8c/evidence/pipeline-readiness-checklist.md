# 自動動画制作パイプライン技術準備チェックリスト

1. **台本生成層**:
   - [ ] 構造化プロンプト（逆説・学術二領域・章立て）
   - [ ] メタファー自動指定（Spotlight, MetricBar, CausalFlow）
2. **音声・音響層**:
   - [ ] 低音・理性的TTS選定（ElevenLabs / Journey等）
   - [ ] 音素・単語単位アライメント抽出
   - [ ] BGM自動ダッキング（ffmpeg -18dB）
3. **描画・モーション層**:
   - [x] 暗黒空間+スポットライト基礎実装（motion-lab/src/PrologueQuestion.tsx）
   - [ ] 共通プリミティブライブラリ整備（Spotlight, ProgressiveBar, Silhouette）
4. **サムネイル層**:
   - [ ] 6〜8文字自動抽出 + 対比SVG自動レイアウト
5. **品質検査層**:
   - [x] 高FPSフレーム抽出・タイムスタンプ検証（motion-lab/tools/extract-frames.ts）
   - [x] 文字配置・衝突検査（src/layout.ts）
