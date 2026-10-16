# 作業記録 T132
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-13T15:25:37.281Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T130〜T137を可能な限りすべて実装する（T132: トレンド・成長指標と分析データ形式の定義）

## 実施内容・変更ファイル
- 新規: docs/TRENDS-METRICS.md（指標定義・データ形式・理由コード・手計算例）、src/trends-schema.ts（型・検査・ポリシー判定・保持期限）、fixtures/trends/synthetic-history.json・boundary-cases.json（合成データ。生成にはスクラッチの一時スクリプトを使い、リポジトリには置いていない）、tests/trends-schema.test.ts。
- 更新: tickets/T132.md（done）、docs/STATUS.md。

## 判断と理由
- 保存するのはAPIの値そのものだけとし、派生値は表示時に計算する（III.E.4.h、T131）。出所 synthetic / youtube-data-api をbatch単位で持たせ、`derivedAllowed` でAPIデータの派生指標を承認記録なしに停止する。
- カテゴリ集計はIII.E.2の該当性が未確認のため、承認後もさらに人の判断（categoryAggregationApproved）を必要にした。
- 比較不能な差分は値をnullにして理由コードを付ける（誤った伸びを表示しない）。viewCount定義変更（2026-08-24）の時刻は公式に記載がないためUTC 0時を境界にした。
- 登録者数は3桁切り捨てのため、差分に±max(u(S0),u(S1))の誤差を付ける。

## 検証コマンド・結果・証跡
- `./scripts/run --test tests/trends-schema.test.ts` → tests 4 / pass 4 / fail 0、EXIT=0（evidence/test.txt）。
- `./scripts/run node_modules/typescript/bin/tsc --noEmit` → EXIT=0（evidence/typecheck.txt）。最初は試験のmap結果がany扱いで型エラー3件、型注釈を付けて解消。

## 未実施・制約
- 手計算例と算出結果の照合は算出処理を作るT136で行う（本チケットは定義と検査まで）。
- viewCount定義変更の正確な時刻、id指定の上限は公式に記載がなく推論。
- 定型作業評価: 「合成fixtureを作り手計算例を文書化する」はT132固有で反復根拠がない。Skill化は見送り。

## TODO・再開方法
- 次はT135（履歴管理）。T134（収集）はT133（human）の認証準備待ちだが、注入可能なAPI境界と合成レスポンスでの試験は先に実装できる。
