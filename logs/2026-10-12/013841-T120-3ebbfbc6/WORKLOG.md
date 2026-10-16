# 作業記録 T120
- 記録者・実施者: Codex
- モデル: gpt-6-astra (runtime)
- 開始日時: 2026-10-12T01:38:41.399Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
現状をチケット駆動で確認し、各エージェント・利用者・PJ全体のタスク状況と残課題を報告する。T120の状況整理の追補として記録。実装・担当再割当・状態変更・外部操作は行わない。

## 実施内容・変更ファイル
README、SPEC、STATUS、AGENT-WORKFLOW、T120と依存T108/T113、未完了25件と直近の関連完了チケットを確認した。docs/PROJECT-STATUS-2026-10-11.mdに製品別実績、人の作業、全残件、依存上の問題を記録した。T120とSTATUSへ本追補の参照を追加した。既存の他者変更は変更していない。

## 判断と理由
T120の状況整理の追補として実施し、新規実装チケットや担当割当を増やさない。製品別実績はsession.actorと結果欄、現在状態はticketsを正本とする。done率は親子チケット混在のため製品完成率にしない。nextのreadyが0でも依存完了backlogが4件あることを区別した。
routine-to-skillを適用：T113/T120に状況整理の反復があるが、task-work-unitsと正本CLIで既に扱う範囲であり、今回固有の集計を新Skill化する追加利益はないため見送り。repository-task-closeoutを今回の記録・終了順に適用した。

## 検証コマンド・結果・証跡
開始前 ./scripts/run src/cli.ts check はEXIT=0、90 tickets・67 sessions。nextはEXIT=0、human T111、agent readyなし、review T106/T121。ticketsもEXIT=0。
Pythonの読み取り集計でdone65/backlog22/review2/ready1を確認。報告書の全残件表とticketsの25件が重複なく一致、依存完了agent backlogがT084/T116/T117/T119、open作業回は自分だけと検査しEXIT=0。evidence/verification.txt、tickets.txt、next.txtに保存。
最初の証跡保存はevidenceディレクトリ未作成でEXIT=1。mkdir後に同じ検査とCLIを再実行して保存成功。計測確認 ./scripts/agentctl status tsk_0mv4l2181c57a99fb419a --require-metered はEXIT=4、running/missing。保存初回もディレクトリ不足で実行前に失敗し、作成後に再実行してevidence/metering.txtに保存した。数値の補完やDB変更は行っていない。
finishと最終checkは本記録を揃えてから実行し、結果はCLI出力で確認する（閉じたログへ事後追記しない）。

## 未実施・制約
状況確認であり全テスト・動画生成・再生・外部API・契約・投稿・commit/pushは未実施。過去の試験成功は各チケットの記録として扱う。T112のPython 3.9失敗は過去T120の証跡で、今回の再試験ではない。各製品の実プロセスの稼働状態は未調査。子エージェント実行なし。本対話の計測はターン中missingであり計測済み成功とは報告しない。

## TODO・再開方法
本人はT106の5点回答、T111素材・利用形態を準備。agentの次候補はT119/T117/T116/T084。外部設定T025/T027/T029/T031は既存の保留方針を維持。T121はチケット末尾の実機確認等を次の作業回で継続。映像の必須依存・T112補完・模擬先行の分離案は未起票、T118とT106の受入れ順にも整理が必要。対話終了後の計測は次の確認時に同じtask_idでstatus --require-meteredを照合する。終了前の他者未終了記録は閉じない。
