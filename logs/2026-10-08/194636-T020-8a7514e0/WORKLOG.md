# 作業記録 T020
- 記録者・実施者: Claude Code
- モデル: claude-sonnet-5-5 (runtime)
- 開始日時: 2026-10-08T19:46:36.313Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T020/T030を公式資料で調査し具体チケット化。T006再生再試験。有料実行・契約・認証・投稿はしない

## 実施内容・変更ファイル
- T020停止ログ(193533)をpausedで復旧クローズ。
- T006: 組み込みブラウザーで実再生・音声信号計測→tickets/T006.md(done)、docs/VERIFICATION.md、evidence/T006-browser-playback.md。
- T020: docs/RESEARCH-AI.md、新チケットT023–T029,T060、T021/T022を親化、tickets/T020.md(done)。
- T030: docs/RESEARCH-YOUTUBE.md、T031手順・T032試験項目を具体化、tickets/T030.md(done)。
- T023: src/budget.ts、config/pricing.json、tests/budget.test.ts。T024一部: src/connections.ts。
- docs/DECISIONS.md(ADR-012)、docs/STATUS.md更新。

## 判断と理由
- 調査は並列の調査サブエージェントに委任。報告は要約取得で、事実資料として扱い、未確認を明記して保存した。
- 有料・契約・認証・投稿が必要なT021/T025/T027/T029/T031/T022実接続/T032/T040/T050は、人の承認・依存未完了のため着手しない。人のチケットを代行しない。
- T006は実再生・音声信号を確認できたためdone。スピーカー実聴はT007に残す。限界を記録。
- T024は配線が残るためdoneにしない。
- Skill化評価(routine-to-skill): 今回の反復は『調査→docs保存→チケット分解』。反復実績がまだ1回のため新規Skill化は見送り。Node型除去の構文制約は単発のためSkill化しない。再帰評価はしない。

## 検証コマンド・結果・証跡
- ./scripts/run --test tests/*.test.ts: 28件成功/失敗0。
- ./scripts/run node_modules/typescript/bin/tsc --noEmit: エラー0。
- ブラウザー実再生: evidence/T006-browser-playback.md。
- cli.ts check: finish後に実行して成功を確認する（結果は利用者への報告に記載）。

## 未実施・制約
- 未実施: 実API呼出・契約・課金・認証・投稿（すべて未承認）。T021,T022,T025–T029,T031,T032,T040,T050,T060は未着手。T024は一部。
- 制約: 調査はWebFetch要約でありページ原文全文は未確認。金額・モデルID・規約は人が再確認が必要。YouTube未監査制限は公式間矛盾で不明。スピーカー実聴は未実施。
- 6場面の実時間連続目視は未実施。

## TODO・再開方法
- 次: 人がT025/T027/T031（契約・上限額・キー設定、秘密値は貼らない）とT007を実施→T026/T028/T060/T032。
- agent: T024の残件（job.json配線）を新しい作業回で。T040/T050は前提完了後に分解。
- 再開手順: NODE_BIN指定→cli.ts check/next→worklog start。
