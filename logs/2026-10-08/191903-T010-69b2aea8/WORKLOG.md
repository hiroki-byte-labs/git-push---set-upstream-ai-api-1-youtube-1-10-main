# T010 エージェント中立化と終了ログ検査
- 実施者・記録者: Codex
- モデル: GPT-6 Astra（user-specified / ユーザー指定表記、実行基盤のIDを独立検証していない）
- 開始日時: 2026-10-08T19:19:03Z / UTC（詳細はsession.json）
- 記録種別: 同時記録。開始調査と新CLIの初期作成後に、このCLIで今回のsessionを作成した。新CLIが存在する前の操作も本ログに含む。

## 依頼・許可範囲
ユーザー原文: 「このログを残すことに関しては、どのAIエージェントもタスク実行後に確実に実施するように仕組みを作成してください。また、このリポジトリの仕組みがCodexを優先するような仕組みなのであれば、他のAIエージェントでも平等に管理できるようにユニバーサルな設計に修正してください」
リポジトリ整備・実装・ローカル検証。契約・課金・push・投稿の既存境界は維持。

## 実施内容・変更ファイル
開始時にAGENTS/README/SPEC/STATUS、T009と関連チケット、check/next、Git状態を確認。開始時17チケット検証成功。Codex限定ownerとscripts/runの端末専用Node自動フォールバックを発見。
- T010を追加し、既存全チケットとテンプレートをowner: human/agentへ移行。src/tickets.ts、src/cli.ts、tests/tickets.test.tsも変更。過去ログ内のCodex実施者・依頼原文は変更しない。
- scripts/runをPATH/NODE_BIN方式へ変更。24以上を確認。特定エージェントの実行環境を暗黙選択しない。
- src/worklog.ts / worklog-cli.ts: startでopen記録、finishでcompleted/paused、checkで本文・証跡・ソースの整合性検査。任意agent名、モデルと情報源を記録。
- src/cli.ts checkへ終了ログ検査を接続。未終了時に成功しない。
- .githooks/pre-commit / scripts/install-hooks: 実際のGit indexを検査。既存フックは上書きせず、このcloneで有効化。
- package.jsonへ共通作業コマンドを追加。
- tests/worklog.test.tsに12件の異常系・中立性・Gitフック試験を追加。
- AGENTS/CONTRIBUTING/README/docs/AGENT-WORKFLOW/SPEC/STATUS/DECISIONS/logsの入口とテンプレートを更新。
- outputsの案内とソース/ログ配布zipを更新予定。これらはGitとハッシュ対象外の引き渡しコピー。

## 判断と理由
1. タスク担当は製品名でなく役割（human/agent）、実施者はログで識別する。
2. 指示文だけでなく、開始/終了の状態とファイルハッシュを使う。本文や記録後のコード変更を検知する。
3. 作業ツリーだけでなくindexを読むことで、ログのステージ漏れ・一部変更だけのcommitを拒否する。
4. 旧ログは履歴として残し、新session.json形式から強制検査を開始。過去に検査したことにはしない。
5. 作業回を閉じることとチケットdoneは区別。人待ちでも事実と残件を記録して作業回を閉じる。
6. ローカルフックは意図的回避や虚偽記述を完全防止できない。公開/外部CIを勝手に追加せず限界を説明。
7. 共通管理はNode/Git、動画描画のMac限定は変更しない。AI製品ごとの特別設定を必須にしない。

## 検証コマンド・結果・証跡
evidence/verification.txtに本作業中の結果を記載。既存12件＋追加12件=24件成功。隔離Gitで実際のcommit前フックの拒否/成功を確認。当前リポジトリは.git/configのhooksPathのみ変更し、commit/pushなし。
チケット一覧とnextはevidenceに保存。終了前のcheckは18チケットの検査成功後、未終了sessionを検出してexit 1。すべて記録後にfinishとcheckを実施する。終了結果・ファイルハッシュはsession.jsonに記録される。

## 未実施・制約
T006の実再生は未確認のまま。モデル本人性、各AI製品の実機連携、Windows実機、外部CIは未検証。秘密が一般文書へ書かれた場合の自動検出・署名付き監査はない。フックを故意に無効化することは技術的に可能。単一作業ツリー1未終了作業の運用であり、分散排他ロックは実装していない。

## TODO・再開方法
humanはT007で視聴、agentはT006を制約解消後に検証。独立してT020/T030の具体化・公式調査が可能。今後はREADME→AGENTS→共通ワークフローを読み、start→作業/結果記録→finish→checkを使用。終了後の修正は新session。通常PATHにNodeがない本端末ではdocs/STATUS.mdの明示NODE_BINを使用する。
外部CI/ブランチ保護が必要になった場合は、外部リポジトリが決まった段階で別チケットと承認を用意する。今回は追加しない。
