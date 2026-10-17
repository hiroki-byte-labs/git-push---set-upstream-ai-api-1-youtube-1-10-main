# 作業記録 T171
- 記録者・実施者: Codex
- モデル: gpt-6.1-sol (runtime)
- 開始日時: 2026-10-16T15:19:49.286Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T171修正: 自動verifiedと旧レポート流用を回帰再現。レポートを案件/台本版へ結合し再検証、CLI/HTTP承認とrender開始で安全停止させる

## 実施内容・変更ファイル
- `src/script-fact-check.ts` を追加し、案件・台本hash・台本ファイルSHA-256・planIdの結合、主張と出典の対応、保存フラグに依存しない再検証、承認証拠のhashを共通化した。
- `src/commands/produce.ts` の自動verified/自動権利合格を未確認ひな型に置換。取り込み時も結合を検証し、statusに不一致を表示する。`src/orchestration-pipeline.ts` の取り込みも同じ検査を使用する。
- `src/production.ts` の共通reviewScriptで承認前に証拠を検査し、承認時hashを保存。状態読み取りで再検証し、renderやqueueが証拠変更後の旧承認を使わないようにした。
- 専用 `tests/fact-check-binding.test.ts` を追加。既存CLI/HTTP/queue/公開模擬などの試験には明示的な合成確認記録を `tests/helpers/checked-facts.ts` から与え、承認の新しい前提を反映した。
- `docs/FACT-CHECK-APPROVAL.md` とREADMEに確認・取り込み・再承認の手順を追加し、T171/STATUSを更新した。既存制作物を変更していない。

## 判断と理由
- URLの存在だけでは原本の照合にも素材権利の確認にもならない。自動生成は未確認の下書きとし、人が記入した確認記録も現在の版に属することを検査する。
- CLIだけで止めてもHTTP/APIから承認可能だったため共通APIへガードを移した。承認後にレポートが差し替わる場合も旧承認を無効化する。過去の案件・確認結果を自動で正当化しない。
- 定型作業評価: T124/T171の確認導線とT120再監査で、確認ひな型と実照合の混同および古い証拠の流用が反復している。入力は制作台本と照合記録、出力は現行版に結合した確認レポートと承認とする。新Skillは作らず既存 `.agents/skills/fact-and-rights-check/SKILL.md` の成果物手順を狭く更新し、現行版のひな型/取り込み/古い版の拒否に今回の試験で適用した。外部資料の実照合は試用していない。

## 検証コマンド・結果・証跡
- `./scripts/run --test tests/fact-check-binding.test.ts`: 修正前5件全失敗を `evidence/before-fix.txt` に保存。最終7件全成功・終了0は `evidence/final-target.txt`。未照合の自動合格、別案件/別plan/旧台本、保存ok偽装、HTTP/API、証拠変更後のrender拒否を確認した。
- 関連production/produce-fact-check/orchestrationとの統合32件全成功・終了0は `evidence/integration.txt`。初回4失敗は従来の自動合格前提が原因で、合成確認fixtureへの移行後に成功した（初回出力は `integration-first.txt`）。
- `./scripts/run --test tests/*.test.ts`: 最終418件中418成功、失敗0、終了0（`evidence/all-tests-final.txt`）。初回全件も418成功（`all-tests-first.txt`）。
- `./scripts/run node_modules/typescript/bin/tsc --noEmit`: 終了0（`evidence/typecheck-final.txt`）。
- T170開始前マニフェストと元outputsを再比較し、2253ファイルの集合・サイズ・mtime・SHA-256全一致（`evidence/outputs-preserved.txt`）。比較用Pythonは読み取りと証跡保存のみで、チケット/状態/終了処理の一括書換えには使用していない。
- skill-creatorのquick_validateはシステムPythonと同梱PythonともPyYAML未導入で終了1（`evidence/skill-validation.txt`, `skill-validation-bundled.txt`）。代わりに小規模追記のfrontmatter/name/description・文書参照・未記入ひな型・権限追加なしを直接確認した。自動形式検査の成功とはしない。
- `scripts/agentctl status tsk_0mvb3yzm0690f09af0d54 --require-metered`: metering_status=missing、usage空、終了4（`evidence/metering.txt`）。数値の補完はしていない。
- 最終 `git diff --check` の結果は `evidence/diff-check.txt` に保存する。終了処理は正本worklog-cli finish後にcli checkで検査し、結果を利用者へ報告する。

## 未実施・制約
- 確認記録の構造・版・承認ガードの検証であり、公開用の実主張を一次資料で実照合した結果ではない。テスト用合成fixtureは本番の確認証拠ではない。ソースの真実性を暗号学的に証明するものでもない。
- T171では新たな動画生成/外部API/投稿/commit/pushは実施していない。T170の実音声48秒動画検証は別の閉じた作業回に記録済み。
- 今回の対話使用量の取得はmissingで未完了。計測正常完了とは報告しない。Skill quick_validateも環境依存が不足し未完了で、直接確認の範囲に限定する。

## TODO・再開方法
- T171の実装・回帰検証は完了。旧形式レポートや旧承認で制作を再開する場合は `docs/FACT-CHECK-APPROVAL.md` に従い現在の台本で実照合し、結合済みレポートを取り込み、人が再承認する。既存結果のhashだけ付け直さない。
- T170/T171以外の既知の独立課題（T175の出力隔離・子プロセス資源実測等）は `docs/AGENT-REMAINING-WORK-RECHECK-2026-10-16.md` を参照し、別チケット作業回で進める。
- 計測は正規Hook由来の使用量取込後に同じstatusコマンドで再確認する。計測DBへの手入力や迂回はしない。閉じた本ログには追記せず、訂正は新しい作業回に残す。
