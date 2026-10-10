# M0〜M1実装の回顧ログ
記録者: Codex / GPT-6 Astra（ユーザー指定）
実施者: Codex（このチャット）
対象日: 2026-10-08 / America/Los_Angeles
根拠: 会話内ツール結果、docs/DECISIONS.md、docs/VERIFICATION.md、docs/verification-data.json、tickets/*.md。個別時刻不明。記載番号は論理的な実施順。完全なシェル履歴ではない。

## 実施順序と結果
1. pwd/git status/ファイル検索と上位AGENTS.md確認。空の作業場所、work/outputsのみ、既存Gitなし、上位規約なしと確認。
2. node/npm/tsc/ffmpeg/ffprobeは通常PATHで利用できず。Swift 6.4.0、Python、Mac音声機能を発見。Codex同梱Node v24.19.0とPythonを利用。環境確認で秘密ファイル内容は読んでいない。
3. Git初期化は.gitの書込み保護で失敗。対象.gitへの権限要求が許可された後、git init成功。署名者設定が空のためコミットは作成しなかった。pushなし。
4. TypeScript CLI、Markdownチケット解析、fixture、接続インターフェース、確認音、投稿無効化を作成。予定していたM0→M1の完全な逐次順ではなく、初回はコード作成と文書・チケット整備が並行した。結果として対応チケットを作成したが、各操作を厳密に1チケットずつ進めたとは主張しない。
5. Node型除去の公式仕様、Apple音声利用条件、Remotionライセンス、AVFoundationを調査。採用理由・URLはdocs/DECISIONS.md。Remotion未導入。Appleシステム声は事業用素材として採用せず、自作正弦波を使用。これはAI側のM1範囲解釈であり、ユーザーがナレーション不要と明示したわけではない。
6. SwiftでAppKit描画とAVFoundation H264書出しを試したがCannot Encode (-11834)。JPEG/MOVも-11800/-12903で失敗。失敗ジョブを保存し完了としなかった。
7. 無料のFFmpeg取得用ネットワーク権限を要求し許可。PyPIからimageio-ffmpeg==0.6.0のmacOS arm64 wheelをwork/python-depsへ取得。約21.1MB。外部APIの課金なし。FFmpegのライセンス・ビルド出力はdocs/toolchain.txt。
8. CoreImage経由PNG生成で画像作成がnilとなり失敗。CGContextの直接画像化に切替。最終構成はTypeScriptの進行管理→Swift/AppKit PNG→FFmpeg H264/AAC。
9. チケット生成用のwork内Pythonスクリプトが一度文字コードエラー。Codex同梱Pythonで正常に実行。最終正本はtickets/*.mdで、workのスクリプトは実行必須ではない。
10. 36秒・6場面・1280×720のMP4を生成。字幕焼き込み、VTT、入力plan、ジョブ、出力ハッシュ、画像、音声解析を保存。
11. Nodeテスト12件成功、チケット16件検証成功。全編デコードと音声再抽出、長さ・音の有無・ピーク、各場面画像を確認。6枚のコンタクトシートも目視。
12. 2回目生成も成功。入力ハッシュ一致、出力MP4ハッシュ不一致。ビット同一の再現性は保証しない。コンテナ36秒、動画863フレーム、AACデコード約36.011秒。端数差をdocs/VERIFICATION.mdに記録。
13. ローカルプレビューサーバー起動。ブラウザー操作が拒否されたためユーザーへ再試行可否を質問。「再試行を許可する」を受領して試行したが保存済み拒否設定で失敗。代替ブラウザー等で回避せず停止。再生成功や音を耳で聴いたという証拠はない。
14. T001〜T005をdone、T006をreviewと記録。T007/T020/T030の依存はT006からT005へ変更し、視聴待ちでも人の視聴・独立調査が可能にした。これは開発者側の依存整理。
15. README/STATUS/運用復旧/検証/素材台帳を整備。outputsに案内とソースzipを作成。サーバーはCtrl+Cで停止。秘密・work・大量成果物がGit除外であることを確認。全条件完了とは報告せず実再生残件を明記して終了。

## 成果物と担当範囲
|ファイル|実装・目的|関連|
|---|---|---|
|AGENTS.md / docs/SPEC.md / ROADMAP.md / DECISIONS.md|規約・要件・段階・判断|U01〜U09 / T001|
|src/tickets.ts / tickets/ / tests/tickets.test.ts|チケット解析、依存検証、担当別着手可否|U05 / T002|
|README.md / scripts/run / scripts/setup-media / .gitignore / .env.example|起動・準備・機密除外|U03,U04 / T003|
|src/providers.ts / fixtures/sample.json / prompts/script.md|模擬台本、自作確認音、接続分離、投稿拒否|U04,U07 / T004|
|src/cli.ts / src/media.ts / scripts/render.swift|ジョブ生成、PNG、MP4、字幕、検証、プレビュー|U07 / T005|
|tests/pipeline.test.ts / docs/VERIFICATION.md / verification-data.json / decode-log.txt|自動検査と限界|U09 / T004〜T006|
|docs/ASSETS.md / toolchain.txt|自作素材とツール由来|U03,U07 / T004,T005|
|docs/OPERATIONS.md / STATUS.md|停止・復旧・再開地点|U03,U06 / T003|
|outputs/reflection-demo-78d5244d/ と reflection-demo-7f46324e/|2回の成功ジョブ。Git対象外|U07 / T005|

## やっていないこと
有料契約・API実行・YouTube認証/投稿・クラウドデプロイ・外部pushなし。自然な読み上げ、実AI生成、10〜20分の検証、承認・予算制御、無人運転は未実装。静的型検査は未導入。T006の実再生は未完了。開発環境や権限が後から変わっても、当時の拒否が解消されたとは推定しない。

## 次のAIへの注意
docs/STATUS.mdと現在のチケットが優先。ログを「新しい課金承認」と解釈しない。過去の生成結果を現在のコードで再検証した結果と混同しない。サンプル確認音の採用判断にはナレーション品質の検証を含まない。
