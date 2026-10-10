# 作業記録 T098
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-10T06:11:31.781Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T098: docs/CLAUDE-REPAIR-INSTRUCTIONS.mdに従い、試行ごとの予約・費用不明額の保持・照合・試行記録を接続契約に加え、無料の模擬接続で回帰試験し記録する。有料API・実接続・push・投稿は行わない

## 実施内容・変更ファイル
- 開始前: T097の作業回終了後に `check` OK（36 sessions）。読んだもの: tickets/T098、src/budget.ts、src/connections.ts、src/commands/sample.tsの接続呼出しとjob.json、tests/budget.test.ts、tests/pipeline.test.ts、docs/HANDOFF.mdのjob.json節、T093 REVIEW.md指摘5。
- tests/budget.test.ts: 模擬の課金接続（fakeMetered、実課金なし）とT098の試験6件を先に追加し、未修正で6件失敗を確認した（初回はMissing expected rejection＝2回呼ばれた）。
- src/connections.ts: FailureCharge、ConnErrorのcharge/providerRequestId、Attempt型、Connection.reconcile、LocalConnectionの失敗をnoneにする処理、callWithBudgetの試行単位化と記録。
- src/budget.ts: unknown、holdUnknown、resolveUnknown、上限判定への不明額の算入。
- src/commands/sample.ts: attemptsの記録とjob.json.attempts、cost.unknown。
- docs/HANDOFF.md、docs/OPERATIONS.md、docs/DECISIONS.md（ADR-016）、tickets/T098.md（done）、docs/STATUS.md。

## 判断と理由
- 費用の状態は接続側が示す（ConnError.charge）。どの失敗が「確実に未処理」かは接続先の仕様に依存し、callWithBudget側でコードから推測すべきでないため。既定をunknownにして、分類を忘れた実接続が無料扱いにならないようにした。
- 例外: LocalConnectionは手元処理だけを包むため、失敗をnoneにする（既存の「描画失敗で予約解放」の挙動を保つ）。ConnError以外の例外は、mode=realならunknown、mock/localならnone。
- 不明額はBudget.reservedではなく別のunknownに分けた。job.jsonで「実行中の見込み」と「費用不明の保持」を区別して表示するため。どちらも上限判定に含める。
- 再送の可否は、保持した不明額を含めた予約が通るかで決める。上限1・見積り0.6では2回目の予約が1.2>1で拒否され、呼び出さない（受け入れ条件の「再送を拒否」）。上限に余裕があれば不明額を積み増して再送し、有限回で止まる。
- 照合は任意のreconcileで、失敗直後に1回だけ行う。判明したら同じ試行の不明分を確定し、試行記録のchargeをreconciledにするので、二重に精算しない。照合の失敗は不明のまま扱う。
- 冪等キーによる「同一依頼として追加課金されない」扱いは、接続先の根拠がないため採用しない（指示書どおり）。
- callWithRetry（予算なしの再試行）は既存試験の対象として残した。制作経路はcallWithBudgetだけを使う。
- 永続化・DB・分散実行には広げない（M5の範囲）。

## 検証コマンド・結果・証跡
- `./scripts/run --test tests/budget.test.ts`（修正前）: tests 12 / pass 6 / fail 6、終了コード1。evidence/before-fix.txt。
- `./scripts/run --test tests/budget.test.ts tests/pipeline.test.ts tests/review.test.ts tests/approval.test.ts`（修正後）: tests 37 / pass 37 / fail 0、終了コード0。evidence/after-fix.txt。
- `./scripts/run node_modules/typescript/bin/tsc --noEmit`: 出力なし、終了コード0。evidence/typecheck.txt。
- 隔離コピー（scratchpad/t098-gen）で `sample --plan bad.json`（lintで停止）: status=failed、cost.unknown=0、usage 1件、attempts 1件（script、success、confirmed、attemptIdとproviderRequestIdが別）。evidence/job-json-failure-path.txt。
- 途中で1件、自分の試験の期待値を直した: 手元のSERVER失敗は再試行対象のため3回試行される（期待を1件→3件のnoneに修正。実装の挙動は仕様どおり）。
- finish後に `cli.ts check` と `next` を実行する。

## 未実施・制約
- 有料API・実接続は呼んでいない。実サービスの依頼ID・費用照合・未処理の保証は未検証。
- 予約と不明額はプロセス内だけで、ジョブをまたいだ予算管理や再起動後の保持はない（M5）。
- 台本取得（最初のcallWithBudget）はジョブディレクトリ作成前なので、そこで失敗した試行はjob.jsonに残らない（従来どおり。現在はmockの固定台本で失敗しない）。
- 完全な動画生成（描画・書出し）は今回実行していない。job.jsonへの記録は失敗経路で確認した。
- Skill化の評価: 指示書の手順どおりで新しい反復はない。全体の評価はT099で行う。今回は見送る。

## TODO・再開方法
- 次はT099（現状説明と履歴の分離）を新しい作業回でstartする。
- 実接続の実装時: 公式仕様で未処理の保証・依頼ID・費用照合方法を確認し、charge=noneの条件とreconcileを実装する。
- 再開: NODE_BINを指定 → `./scripts/run src/cli.ts check` → `next`。
