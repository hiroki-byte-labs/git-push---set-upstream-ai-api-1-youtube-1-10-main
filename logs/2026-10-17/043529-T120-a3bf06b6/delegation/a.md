# 共通指示（読取専用の抜き取り再監査）
リポジトリ: /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10
あなたは親作業回（logs/2026-10-17/043529-T120-a3bf06b6、親が保持）の子作業。ファイルを変更しない。worklog start/finish、チケット・STATUS・ログの編集、他AIへの再委譲、動画生成、ネットワークアクセス、git操作（status/diff/log/show以外）をしない。

目的: 担当チケットで「done」とされた主張（tickets/Txxx.md の受入条件・結果欄、該当logsのWORKLOG.md）が、現在のコード・試験と一致しているかを確かめ、実害のある乖離だけを報告する。背景: 同じリポジトリの直前の再監査（T160〜T176）では13件中5件で、「描画側の不合格を無視して合格」「キューが別ジョブを今回の設定で描画」「検査結果が画像と未結合で差替え後も承認可」などの実害が見つかった。

確認観点（重要度順）:
1. 受入条件の要求が実装に存在しない／制作経路（src/commands/sample.ts・produce.ts・production.ts 等）に接続されていない
2. 失敗・欠測・不正入力を合格扱いにする経路（固定値の合格、例外の握りつぶし、未測定をpass）
3. 試験が主張を実際には検証していない（自分で作った期待値の照合だけ、モックで本体を迂回）
4. 文書・チケットの記載と実装の数値・パスの不一致
一般的な好みやリファクタ提案は書かない。

調べ方: rg/sed/cat で読み、必要なら `./scripts/run --test tests/<対象>.test.ts` や、/tmp 等の一時ディレクトリ内で `node -e` による最小の再現を実行してよい（リポジトリ内に書かない）。

出力（日本語、Markdown）: 担当チケットごとに「判定: 問題なし／軽微／要修正」と、要修正・軽微なら各項目に (a) 主張 (b) 実際（ファイル:行）(c) 影響 (d) 再現手順またはコード上の根拠 (e) 確度（確認済み/仮説）。最後に全体の要約3行。

## 担当: 人の確認工程・投稿の安全 T124, T128, T129, T140
主な対象: src/production.ts, src/orchestration-pipeline.ts, src/review.ts, src/fact-check.ts, src/script-fact-check.ts, src/mock-publisher.ts, src/commands/produce.ts, .agents/skills/fact-and-rights-check/, 関連tests（production, orchestration-pipeline, documentary-pipeline-e2e, mock-publisher, approval）。
特に: 本人の工程（題材選択・考察・台本承認・動画承認）をエージェント名や試験用の経路で代行・迂回できないか、承認の失効条件の漏れ（何を変えても失効しないか）、mock投稿台帳の重複防止・応答喪失時の照合が主張どおりか、E2Eが偽MP4で何を検証し何を検証していないか。
