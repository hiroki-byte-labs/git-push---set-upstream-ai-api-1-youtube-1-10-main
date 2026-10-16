# 作業記録 T121
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-12T02:11:41Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
利用者の依頼（2026-10-12）: T121の残課題を進める（Codexデスクトップのサブエージェント確認、Antigravity対話の発言ごとのタスク分割、コスト削減の実測）。保護対象の変更と購読枠の実機試験は包括許可済み（AGENTS.md）。

## 実施内容・変更ファイル
- 調査: Codexデスクトップアプリのサブエージェントの記録はまだない（DB確認）。Antigravityの会話記録（brain/<会話>/.system_generated/logs/transcript.jsonl）の構造を、自分の試験の会話だけで項目名を確認し、ステップごとの使用量があること、合計が `agy -p` の結果と一致すること、子の会話の使用量が親に含まれないことを確認。
- 保護対象外の変更: `orchestration/telemetry/normalize.ts`（fromAgyStep・agyTranscriptUsage・agyLastUserInput・agyTranscriptPath）、`orchestration/gateway/gateway.ts`（linkAgyChildren: Gateway経由の子の会話の実測）、`orchestration/optimizer/optimizer.ts`（単価がそろう戦略どうしでだけ費用比較）、`orchestration/telemetry/monitor.ts`（repriceUsage）、`orchestration/gateway/agentctl.ts`（reprice）、`orchestration/tests/agy.test.ts`（新規）、`orchestration/tests/monitor.test.ts`。
- 保護対象（`./scripts/agentctl maintenance apply` で適用、包括許可）: パッチ7（hook.ts: Antigravity対話の会話記録からの実測、Stopごとの区切り、発言による分類、受信項目名の記録／models.json の根拠／hooks.test.ts）、パッチ8（hook.ts: Antigravity自身の会話を環境変数で入れ子判定しない、対話中の子の会話の結び付け、子の計測の後にプレースホルダーを消す／hooks.test.ts）、パッチ9（models.json: Codex 3モデルの公式単価／monitor.test.ts）。パッチは `docs/agent-routing/pending-fixes-7〜9.patch`。
- 実データの補完: Gateway経由のAntigravityの子2件の使用量を会話記録から実測で記録（linkAgyChildren）、`agentctl reprice` で過去の使用量79件のAPI相当額を計算。誤った改善提案1件を却下として記録（方針は不変）。
- 実機試験（購読枠）: Antigravityのサブエージェント1回、Codexのコスト実測8回（Git管理外の `work/agentctl-pilot/`）。
- 文書・記録: `docs/agent-routing/verification-report.md`（追記5、6章）、`architecture.md`（子の使用量の行）、`tickets/T121.md`、`docs/STATUS.md`。

## 判断と理由
- 事前調査（サブエージェントの報告）の「Antigravityの会話記録に使用量はない」を実データで覆した。合計の一致を3会話で確かめてから計測元に採用した。思考の内数は記録にないため unavailable とした。
- Antigravityは発言ごとのHookがなく、Hookに本文も来ないため、実行ループの終了（Stop）を区切りにし、会話記録の最後の発言で分類する方法を選んだ（本文は保存しない）。
- 環境変数による入れ子判定は、Antigravity内のサブエージェントを誤って止める恐れがある一方、Antigravity内からのCLI直接起動は run_command の判定で拒否されるため、Antigravity自身の会話には使わないことにした。
- コスト実測は、合否を機械的に判定できる最小の課題にし、両戦略を同条件（同じ課題・各4回・試験つき）で比べた。小標本であることを結果に明記した。
- 実測で、Optimizerがトークン数を費用の代わりにして誤った提案を出したため、比較の規則自体を直した（単価がそろわなければ提案しない）。そのうえで公式単価を確認して登録し、正しく判定し直した。単価は検索の要約ではなく公式のモデルページで確かめた。
- `maintenance apply` は、パッチ8の初回で試験の期待値の誤りにより一時コピーの試験が失敗し、本体を変えずに止まった（安全装置が働いた実例として証跡に残した）。
- 定型作業の評価（routine-to-skill）: 今回の保護対象の変更は前回Skill化した手順（model-router「保守」）と `maintenance apply` で3回行い、手順の追加・変更は不要だった。新しい反復候補はない。

## 検証コマンド・結果・証跡
- 会話記録と結果の一致: 0aec887e 62,393、9fafcaee 15,029、c4779f61 41,307（会話記録の合計＝結果の usage）。子 14d3893a は 14,486（親に含まれない）。
- 単体: agy.test（2件）合格。実データの補完 `linkAgyChildren` で子2件が measured（evidence/agy-child-backfill.txt）。
- パッチ7: `maintenance apply` → applied（77件合格、evidence/maintenance-apply-7.json）。パッチ8: 1回目は一時コピーの試験失敗で不適用（maintenance-apply-8-rejected.json）、期待値を直して applied（78件、maintenance-apply-8.json）。パッチ9: applied（79件、maintenance-apply-9.json）。
- Antigravityのサブエージェント（`./scripts/agentctl run --task work/agentctl-real/sub-agy-l2.json`）: 親 36,564・子 31,341 とも measured、受信項目名と環境変数名を記録（evidence/real-run-sub-agy-link.json）。
- コスト実測: 8回とも completed・試験合格（evidence/cost-pilot-runs.txt）。初回の `optimize propose --min-samples 4` は誤った提案（cost-pilot-propose.json、却下: invalid-proposal-rejected.txt）。修正・単価登録・`agentctl reprice`（79件、reprice.json）後の提案は no_change、合格1件当たり 軽量 $0.002155・標準 $0.032922（cost-pilot-propose-2.json、cost-pilot-report-2.md）。routing-policy.json は基準ハッシュ 3a223b71… のまま。
- 全体: 79件合格・型検査 exit 0（tests-final.txt）。`doctor --audit`: 未観測0件（Claude 2・Codex 24）、warn は version_codex_app（デスクトップ 0.162.0-alpha.2）・GEMINI_API_KEY未設定・過去のHookエラー記録（doctor-final.json）。

## 未実施・制約
- Codexデスクトップアプリでのサブエージェントのモデル注入、Antigravityの対話中のサブエージェントの結び付け（`ANTIGRAVITY_CONVERSATION_ID` の値）は、どちらも利用者がそのアプリで使ったときの記録でしか確認できない。
- コスト実測は各4件・1課題の小標本。各戦略20件以上の評価つき実績による提案は未実施。
- 購読枠の利用なので、API相当額は実際の請求額ではない。

## TODO・再開方法
- tickets/T121.md「ブロック理由と再開」の1〜4。利用者の操作は不要。
