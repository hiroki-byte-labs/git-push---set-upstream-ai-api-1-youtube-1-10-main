# 作業記録 T024
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
エンハンス一括実施のうちT024の残件（接続抽象・Budgetを制作工程とjob.jsonへ配線、候補5）。ローカル作業のみ・実API呼出なし

## 実施内容・変更ファイル
- src/connections.ts
  - `Mode = 'mock' | 'local' | 'real'`を追加し、Usage.modeとConnection.modeに使う。
  - LocalConnection（新規）: 既存の手元処理を接続として包む。費用0、requestIdは`<mode>-<provider>-<連番>`。
  - callWithBudget（新規）: budget.reserve(見積り) → callWithRetry → settle（成功時。usageを追記）。失敗時はrelease。
- src/commands/sample.ts
  - 台本（mock.fixture）、音声（mock.sine-cues）、描画（local.appkit-ffmpeg）をcallWithBudget経由で実行する。
  - job.jsonにusage[]を追加し、costを`{currency: 'USD', limit, committed, reserved, basis}`に変更した。旧来は`{amount: 0, currency: 'JPY'}`。
  - --budget-usd <非負数>（既定0）を追加した。
- src/cli.ts: 使い方を更新した。
- tests/budget.test.ts（+2）: 上限超過は呼出し前に拒否する。成功で精算とusageの記録、失敗で予約を解放する。tests/plan.test.ts（+1）: --budget-usdの引数。
- tickets/T024.md（done）、docs/STATUS.md。

## 判断と理由
- 描画は外部APIの模擬ではなく手元で完結する処理のため、modeをlocalとしてmockと区別した。「模擬を実接続の成功扱いにしない」規約を、job.jsonで見分けられるようにするため。
- costをUSDに統一した。config/pricing.jsonと調査結果がUSD建てで、円換算は未確認のため（docs/RESEARCH-AI.md）。過去のjob.jsonの値は当時の記録として残す。
- 既定の上限を0 USDにした。実接続が入っても、明示しなければ費用が発生しない側に倒すため。
- 見積りは現状すべて0。実接続のチケット（T026、T028、T060）で、estimate*関数の値を渡す。
- Skill化の評価: 新しい定型手順はない。見送る。

## 検証コマンド・結果・証跡
証跡はevidence/verification.txtに保存した。
- `cli.ts sample --plan fixtures/sample-v2.json --budget-usd 0` → bias-check-demo-14025bab。completed、usageは3件（script/mock、audio/mock、visual/local、各attempts=1）、costはlimit 0、committed 0。
- `cli.ts sample`（v1） → reflection-demo-c9a32a3f。completed、modeはmock、mock、local。
- `cli.ts sample --budget-usd abc` → 「不明な引数」で失敗した（意図どおり）。
- `--test` → 70件成功。`tsc --noEmit` → エラー0。

## 未実施・制約
- 実接続（mode=real）はまだない。費用の見積りと精算は0の経路でしか動いていない。
- 上限の永続化（複数ジョブにまたがる月次予算）は未実装（M5、T050）。

## TODO・再開方法
- 次はT033（承認プレビューとジョブ管理）。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T033`。
