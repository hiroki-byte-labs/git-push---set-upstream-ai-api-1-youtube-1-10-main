# 共通指示（読取専用の抜き取り再監査）
リポジトリ: /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10
あなたは親作業回（logs/2026-10-17/030502-T120-af598b96、親が保持）の子作業。ファイルを変更しない。worklog start/finish、チケット・STATUS・ログの編集、他AIへの再委譲、動画生成、ネットワークアクセス、git操作（status/diff/log/show以外）をしない。

目的: 担当チケットで「done」とされた主張（tickets/Txxx.md の受入条件・結果欄、該当logsのWORKLOG.md）が、現在のコード・試験と一致しているかを確かめ、実害のある乖離だけを報告する。背景: 同じ時期に同じ担当がdoneにしたT170/T171/T175では、後の再監査で「未照合URLを自動verifiedにする」「音声を黙って切り捨てる」「ベンチマークが別パスを見て媒体検査を省略する」実害が見つかった。

確認観点（重要度順）:
1. 受入条件の要求が実装に存在しない／制作経路（src/commands/sample.ts・produce.ts・production.ts 等）に接続されていない
2. 失敗・欠測・不正入力を合格扱いにする経路（固定値の合格、例外の握りつぶし、未測定をpass）
3. 試験が主張を実際には検証していない（自分で作った期待値の照合だけ、モックで本体を迂回）
4. 文書・チケットの記載と実装の数値・パスの不一致
一般的な好みやリファクタ提案は書かない。

調べ方: rg/sed/cat で読み、必要なら `./scripts/run --test tests/<対象>.test.ts` や、/tmp 等の一時ディレクトリ内で `node -e` による最小の再現を実行してよい（リポジトリ内に書かない）。

出力（日本語、Markdown）: 担当チケットごとに「判定: 問題なし／軽微／要修正」と、要修正・軽微なら各項目に (a) 主張 (b) 実際（ファイル:行）(c) 影響 (d) 再現手順またはコード上の根拠 (e) 確度（確認済み/仮説）。最後に全体の要約3行。

## 担当: サムネイル基盤 T160, T161, T162, T163, T164, T165, T166
主な対象: src/thumbnail-brief.ts, src/thumbnail-candidates.ts, src/thumbnail-recipes.ts, src/thumbnail-renderer.ts, scripts/render-thumbnail.swift, src/thumbnails.ts, src/review.ts（ReviewBundle/bundleHash）, src/remotion-visual.ts, src/commands/sample.ts, 関連tests。
特に: T165「実画像・全テキスト検査・欠測拒否」が本当に欠測で拒否するか、T166の承認ハッシュに採用サムネイルと品質結果が入り変更で失効するか、T164でnative/Remotion両方がサムネイル描画に接続されるか。
