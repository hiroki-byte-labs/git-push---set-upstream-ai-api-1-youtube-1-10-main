# T006 ブラウザー実再生の再試験（2026-10-08 UTC / Claude Code, claude-sonnet-5-5）
- 環境: `./scripts/run src/cli.ts serve`（127.0.0.1:4173）を Claude デスクトップアプリの組み込みブラウザーで開いた。過去の権限拒否は発生せず。
- 対象: outputs/reflection-demo-7f46324e/sample.mp4（latest.json）
- 再生: video.play() 成功、mediaError なし、readyState=4、duration=36、videoWidth×Height=1280×720。4秒後 currentTime≈3.86（実時間で進行）。33秒へシーク後、4.5秒で ended=true、currentTime=36.0。
- 画面: 最終場面のスクリーンショットで、タイトル、3段階図解（把握する→振り返る→学びを残す）、焼き込み字幕「学習用の試作です。個別銘柄の推奨や利益の保証はしません。」を目視。
- 音声: Web Audio AnalyserNode で冒頭6秒を計測。peak=0.160、100ms窓60回中8回で信号あり（場面冒頭の確認音のみ、という仕様と整合）。
- 限界: 全6場面を実時間で連続目視したわけではない（最終場面のみ画面確認、他場面は過去の抽出画像とデコード検査に依存）。スピーカーからの実聴は未実施（人が行うT007）。日本語ナレーションは対象外。
