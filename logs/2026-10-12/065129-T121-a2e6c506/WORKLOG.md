# 作業記録 T121
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-12T06:51:29.550Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
利用者がAntigravityの対話（flash-medium）でサブエージェントを実行。結び付け・計測の確認と、不足があれば修正

## 実施内容・変更ファイル
- 保護対象外: `orchestration/gateway/agentctl.ts`（読取り専用の `events [--kind] [--session] [--limit]`、`status --session`）。
- 保護対象（`agentctl maintenance apply`、包括許可）: パッチ11（hook.ts: 親のStopで、親の会話記録にある子の会話IDから子を結び付け、独立の対話として記録された子の使用量を移して実測する `linkAgyInteractiveChildren`。hooks.test.ts に実機の順序を再現する試験）、パッチ12（親の実行の有無に依らずStopごとに処理、関数をexport）。パッチは `docs/agent-routing/pending-fixes-11.patch`・`12.patch`。
- 実データの補完: 今回の親の会話 e91bbbfa… に `linkAgyInteractiveChildren` を1回実行（スクラッチパッドのスクリプト）。
- 文書: verification-report.md（追記8、条件4の再判定）、architecture.md（子の使用量の行）、tickets/T121.md（done、完了後の監視）、docs/STATUS.md。

## 判断と理由
- 実データで、子の会話の `ANTIGRAVITY_CONVERSATION_ID` が子自身のID（env_conversation_is_self: true）と分かったので、環境変数による結び付け（パッチ8の想定）は成立しないと判断した。親の会話記録の「Created the following subagents」に子の会話IDが残るため、それを結び付けの根拠にした。invoke_subagent は非同期なので、PostToolUseではなく親のStopで処理し、何度呼んでも結果が同じになるようにした（使用量は dedupe_key で1回だけ計上）。
- 子の会話は独立の対話タスクとして記録されていた。二重計上と記録の消失の両方を避けるため、消さずに親子関係をつけて `included_in_parent` にし、使用量の行だけ子の実行へ移した。
- 計測DBは規約で直接読めないため、読取り専用の `agentctl events` を追加してイベントを確認した。
- 完成条件4は、親子・実モデル・計測が実データでそろったため「満たす」と判定し、T121をdoneにした。ただし、修正後のHookが実際のStopで自動的に処理するところは未観測である。補完は同じ関数の手動実行であることを区別して記録した。

## 検証コマンド・結果・証跡
- パッチ11の一時コピー: 80件合格・型検査合格。パッチ12の自前の一時コピーではdoctorの試験1件が失敗したが、一時コピーに `.codex/hooks.json` を含め忘れたことが原因（修正とは無関係）。`maintenance apply` 自身の一時コピーと本体では、ともに全件合格（evidence/maintenance-apply-11.json・12.json、applied:true、codex_retrust_required:false）。
- 本体: 80件合格・型検査 exit 0（evidence/tests-final.txt）。doctorのwarnは auth_gemini-api と過去のHookエラー記録だけ（evidence/doctor-final.json）。`database is locked` は1件のまま。
- 実データ: `agentctl status exe_0mv4w4tuebf27fdf5b311 --require-metered` exit 0。親 exe_0mv4w4mve9bbef6fb889a、agent_id 07a89336…、gemini-3.8-flash-medium、completed、30,795トークン measured（3ステップ。子の会話記録の合計と一致）（evidence/agy-interactive-child.json）。イベント: agy_child_session_bound（via=parent_transcript）、agy_child_usage_linked（steps 3、moved_from 1）、子の agy_payload_keys の env_conversation_is_self: true（evidence/events-bound.json、events-child-session.json）。

## 未実施・制約
- 修正後のHookが実際のAntigravityのStopで自動的に結び付けるところは未観測（模擬試験のみ）。
- models.json のAntigravity `child_usage`（unavailable）は実態と合っていないが、PostToolUseの仮記録に使っているため今回は変えていない。
- パッチ8の環境変数による結び付けのコードと試験は残っている（実機では成立しないが害はない）。

## TODO・再開方法
- tickets/T121.md「ブロック理由と再開」の完了後の監視1〜3。次にAntigravityの対話でサブエージェントを使ったら `./scripts/agentctl events --kind agy_child_session_bound` を確認する。
