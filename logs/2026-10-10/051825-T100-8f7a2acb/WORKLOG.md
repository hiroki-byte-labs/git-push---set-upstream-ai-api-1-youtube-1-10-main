# 作業記録 T100
- 記録者・実施者: Codex
- モデル: GPT-6 Astra (user-specified)
- 開始日時: 2026-10-10T05:18:25.422Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
Claude向けにT094〜T099を最小作業単位から修正・検証・記録できる指示書を作成する。本体修正や外部送信は行わない。

## 実施内容・変更ファイル
docs/CLAUDE-REPAIR-INSTRUCTIONS.mdを新規作成した。冒頭にClaudeへ渡す依頼文を置き、環境確認、1件ずつのstart、6課題の小さな手順、期待する試験結果、終了と中断、最終報告を記載。T100を作成して作業記録を開始し、完了条件を確認後doneに更新。docs/STATUS.mdに指示書の入口を追記した。利用者用のコピーをoutputs/CLAUDE-REPAIR-INSTRUCTIONS.mdへ保存する。

## 判断と理由
今回は指示書の作成依頼なので本体修正は行わず、T094〜T099のreadyを維持した。退避データ保全を最優先、文書整合は実装結果を反映するため最後にした。小さな手順はチケット内の実行単位とし、状態管理を重複させる別チケット一覧は作らない。Claudeのモデルを推測せずunknownを使える開始例とした。
routine-to-skillに従い、T093と今回の終了記録の反復を評価。入力はチケット・検証結果、出力は終了ログであり、repository-task-closeoutと重複するため新規Skillは見送り、既存Skillを適用する。今回固有の修正指示書をさらにSkill化する反復実績は不足。Skill原本は変更しない。

## 検証コマンド・結果・証跡
NODE_BINに端末の実在Node24実行ファイルを明示してscripts/runを使用した。開始時cli.ts checkは68 tickets/30 sessionsで成功し、nextにT094〜T099のreadyを確認した。git status --shortで初回コミット前の未追跡ファイルを確認し、既存内容を保護した。rg --files testsで指示書中の対象試験名を照合。
NodeのreadFileSync/existsSync/assertを使った文書検査で参照パスと6チケット、モデル情報源・終了・中断手順を確認した。初回は「fixtures/prompts」という並列表現をパスと解釈して失敗したため、文書を「fixturesとprompts内の対象ファイル」に明確化し再実行、終了コード0。最終結果はevidence/document-check.txt。手順を目視確認し、open中はcheckが通らないため直接試験→記録→finish→checkとした。finish/checkの最終成否はCLI出力と利用者への報告に残し、このログを終了後に追記しない。

## 未実施・制約
本体コードの変更、修正後の回帰テスト、Claudeへの外部送信・起動は未実施。今回は文書のみの変更なので全110件の再試験や動画生成は行わない。T093の過去結果を今回の結果として扱っていない。有料呼出・契約・push・投稿も実施していない。

## TODO・再開方法
利用者が指示書の依頼文をClaudeへ渡す。実行担当はAGENTSと指示書を読み、check/nextで最新状態を確認し、T094を新しい作業回でstartする。各チケット完了後に次へ進む。T100は指示書作成の完了だけを意味し、6件の修正完了ではない。
