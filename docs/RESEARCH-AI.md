# AI接続の公式調査（T020）
確認日: 2026-10-08 / 記録: Claude Code (claude-sonnet-5-5)。公式ページをWebFetch要約経由で確認した。全文の原文確認ではなく、**金額・モデルID・規約は契約前にT021で人が公式画面を再確認する**。円換算は公式に無く未確認（USDで比較）。契約・キー入力・有料実行はしていない。

## Gemini（台本）
- 公式: https://ai.google.dev/gemini-api/docs/pricing / models / rate-limits / terms / billing / tokens / deprecations / safety-settings
- 掲載モデル: gemini-3.8-flash、3.7-flash、3.5-flash、3.5-flash-lite。新規には3.5 Flash-Liteまたは3.8 Flash推奨。
- 単価（100万トークン）: 3.8 Flash 入力$0.75/出力$3.75（2026-12-31まで表記、以降未確認）、3.5 Flash-Lite $0.30/$2.50。無料枠あり。
- 無料枠の入出力は製品改善に使われ人間が閲覧し得る。有料は使われない。**未公開・機密は無料枠に入れない**。
- 出力の所有権主張なし。他者に類似出力があり得る。前提は18歳以上。
- previewは短い予告で廃止され得る→stable IDを固定。レート制限の数値はダッシュボードで確認する方式（未確認）。
- 費用制御: AI Studioのプロジェクト別月次上限（実験的）、ティア別月間上限、応答usageとcount_tokens。課金反映に約10分遅延→ベンダー側は最後の安全網。
- 安全フィルタ: finishReason=SAFETY等を処理する必要。

## 日本語TTS
- ElevenLabs（https://elevenlabs.io/docs/overview/models, /pricing, /pricing/api, /terms-of-use）: v4/Multilingual v2/Flash v2.5/v3は日本語対応表記。長尺はMultilingual v2が最安定と記載。API従量 v4 $0.022/千文字（割引表記あり、終了後未確認）。**無料プランは非商用、商用はStarter以上**。プラン表記間に数値不一致あり（要確認）。API上のモデルID文字列・rate limit・request-idヘッダ名は未確認。ボイスごとの商用条件は未確認。
- Gemini TTS（https://ai.google.dev/gemini-api/docs/speech-generation）: gemini-3.8-flash-tts / -lite-tts、日本語対応、WAV 24kHz。音声出力$9.00/$6.00 per 百万トークン、32トークン/秒。15分で約28,800トークン（計算値）。入力長上限・透かしは未確認。
- 費用差は小さい見込み（15分で概ね$0.2〜0.3、計算・推測）。**品質（人の試聴）と長尺安定性で選ぶ**。

## Runway（必要箇所のみ）
- 公式: https://docs.dev.runwayml.com/guides/models/, /guides/pricing/, /usage/tiers/, https://runway.com/terms-of-use
- 1クレジット=$0.01、モデル別秒単価（wan3 5〜20cr/秒 等）。gen4.5単価・ステータス名・出力URL有効期限は未確認。
- 出力の商用利用は規約順守で制限なし。入出力は学習・改善に使うライセンスを付与（オプトアウト未確認）。API組込みには「Powered by Runway」表示要件（YouTube自動制作への適用は未確認、要人確認）。
- 費用制御: プリペイドのクレジット、ティア別月間上限、秒数×単価の事前見積り。

## 設計への含意
1. 自前の事前見積り（文字数・トークン・秒数×単価、単価は設定ファイル化し確認日を持つ）。実行前に上限超過なら拒否。
2. 事後usage・依頼IDをjob.jsonへ記録。確定額＋実行中見込額で判定（SPEC）。
3. 429/SAFETY/失敗は有限再試行。出力URLは即時ダウンロード。
4. 実接続と模擬を区別して記録。模擬を成功扱いしない。

## 順序と分解（T020決定）
Gemini台本 → 音声（ElevenLabsとGemini TTSを同一台本で人が聴き比べ）→ 必要箇所のみRunway。T021（人）を契約別に分け、実装は共通部（見積り・抽象・模擬）→接続別の順。実装チケットは T023〜T028（tickets/）。
