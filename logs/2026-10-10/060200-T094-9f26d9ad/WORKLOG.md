# 作業記録 T094
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-10T06:02:00.409Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T094: docs/CLAUDE-REPAIR-INSTRUCTIONS.mdに従い、退避先衝突による上書きを修正し、隔離回帰試験と記録を完了する。契約・有料API・push・投稿・既存outputsの整理は行わない

## 実施内容・変更ファイル
- 開始前: `cli.ts check` OK（70 tickets / 32 sessions、最新 052511-T101）、`next` でT094〜T099がagent ready。core.hooksPath=.githooks（設定済みのためinstall-hooksは実行せず）。PATHにnodeがないため、NODE_BIN=/Users/hongj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node（v24.19.0）を環境変数で指定（ソースには埋め込まない）。
- 読んだもの: AGENTS.md、README、SPEC、STATUS、AGENT-WORKFLOW、docs/CLAUDE-REPAIR-INSTRUCTIONS.md、T093のREVIEW.md、tickets/T094、src/jobs.ts、src/cli.tsのjobs clean、tests/review.test.ts。
- tests/jobs.test.ts（新規）: 衝突に関する回帰試験6件を先に追加し、未修正の実装で4件失敗することを確認した。
- src/jobs.ts: applyCleanを書き換えた。全候補の退避先を事前確認し、1件でも存在すれば何も移動せず拒否する。移動直前にも再確認する。途中で失敗したら、移動済みの一覧をerror.movedとメッセージで返す。
- docs/OPERATIONS.md: 復元先、衝突時と途中失敗時の扱いを追記した。
- tickets/T094.md: done、結果と証跡を記載した。docs/STATUS.md: 先頭に今回の修正の進捗を記載した。

## 判断と理由
- 採番ではなく「変更前に全体を拒否」を選んだ。既存の退避物を一切変えず、退避先の名前が常に元の名前と一致するため、復元手順が単純なまま。指示書でも許容された最小の方針。利用者は退避済みのものを確認して別名にしてから再実行する（OPERATIONSに記載）。
- 1件の衝突でも全体を止める。一部だけ移動すると、どこまで移ったかが分かりにくいため。
- renameは既存ファイルと空ディレクトリを黙って置き換える（POSIX）。そのため存在確認を移動直前にも行う。lstatでsymlink（リンク先なし）も衝突として扱う。確認とrenameの間の競合までは防げない（ローカル単独利用の前提）。
- 途中失敗（消えたファイル・権限など）はロールバックせず、移動済み一覧を返す。逆移動の失敗で状態がさらに複雑になるのを避けた。
- _trash衝突の試験は修正前にも成功した。非空ディレクトリへのrenameはOSがENOTEMPTYで拒否するため。偶然の成功に頼らず、明示的な拒否に変えた。
- 既存outputsでjobs clean --applyは実行していない（指示どおり、本番の整理は試験ではない）。

## 検証コマンド・結果・証跡
- `./scripts/run --test tests/jobs.test.ts`（修正前）: tests 6 / pass 2 / fail 4、終了コード1。evidence/before-fix.txt。
- `./scripts/run --test tests/jobs.test.ts tests/review.test.ts`（修正後）: tests 13 / pass 13 / fail 0、終了コード0。evidence/after-fix.txt。
- `./scripts/run node_modules/typescript/bin/tsc --noEmit`: 出力なし、終了コード0。evidence/typecheck.txt。
- 全テストの最終実行はT099で行う（作業回中は対象試験と型検査のみ）。finish後に `cli.ts check` と `next` を実行する。

## 未実施・制約
- 確認とrenameの間に別プロセスが同名を作る競合は防げない。
- 途中失敗時の自動ロールバックはしない。
- 既存outputsの整理、実ファイルでのCLI実行は行っていない（一時ディレクトリでの試験のみ）。
- Skill化の評価: 今回の作業は「再現試験→修正→記録→finish」で、手順はdocs/CLAUDE-REPAIR-INSTRUCTIONS.mdと既存Skill repository-task-closeoutで既に管理されている。新しい反復はまだなく、見送る。T094〜T099を通した反復の評価は最後のT099でまとめて行う。

## TODO・再開方法
- 次はT095（承認を確認対象一式の版に結び付ける）を新しい作業回でstartする。
- 再開: NODE_BINを指定 → `./scripts/run src/cli.ts check` → `next`。
