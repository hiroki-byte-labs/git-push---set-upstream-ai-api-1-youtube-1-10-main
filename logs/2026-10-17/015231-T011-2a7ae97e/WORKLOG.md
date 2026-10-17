# 作業記録 T011
- 記録者・実施者: Codex
- モデル: gpt-6.1-sol (runtime)
- 開始日時: 2026-10-17T01:52:31.915Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
課題確認→チケット切出し→改善・検証→残件再確認の反復を共有Skill化し、既存Skillへ接続して形式検証・実リポジトリで試用する

## 実施内容・変更ファイル
- 共有 `.agents/skills/issue-to-improvement/SKILL.md` を作成し、実態調査、重複のないチケットへの切出し、許可範囲内の実装/検証、残件再確認の入口を定義した。
- 既存 `.agents/skills/task-work-units/SKILL.md` へ入口案内と既存許可を尊重する起票条件を追記。READMEへ使い方、T011とSTATUSへ今回の作成・検証範囲を記録した。
- 個人Skillディレクトリに同名がないことを確認して共有原本へのsymlinkを新設した。機能/製品設定や既存Skillの上書きは行っていない。

## 判断と理由
- 利用者が具体的な反復手順のSkill化を希望した。根拠はT120の課題棚卸し/再監査、T170/T171の修正、T175の測定基盤補強と、その後のREADME/SPEC整合の実施履歴である。ready0を課題枯渇と扱うこと、模擬/推計を実検証と混同することを繰り返さない分岐が必要だった。
- 入力は依頼範囲・tickets・実装・検証証跡。出力は既存票との対応、必要なら許可済みの新規票、検証済みの改善と残件/再開方法。既存task-work-unitsは分解、repository-task-closeoutは終了を担うため、全文を重複させず両者をつなぐ新Skillにした。
- 調査依頼だけで起票/実装せず、チケット化を既に許可されている場合は同じ確認を繰り返さない。本人採用/考察/承認や課金/push/投稿の許可は拡張しない。固定件数で止めず、依頼範囲の完了か実際の前提条件で区切る。
- 今回の抽出自体がroutine-to-skillの評価・作成・試用であり、これを根拠に別のメタSkillをさらに作る再帰評価は行わない。

## 検証コマンド・結果・証跡
- 開始時の `./scripts/run src/cli.ts check` は155 tickets/162 sessionsで成功、nextとGit差分を確認。既存の未コミット差分は保持した。T011/直接依存T009/T010と必読文書、既存Skillを参照した。
- `PYTHONPATH="$PWD/work/skill-validation" python3 <skill-creator>/scripts/quick_validate.py <対象Skill>` を新規issue-to-improvementと更新task-work-unitsへ実行。両方Skill is valid、終了0（`evidence/skill-validation.txt`）。既存の実PyYAML 6.0.2を使用し、validator/依存の偽装や追加インストールは行っていない。
- 原本Skillを読み直し、参照7件の実在、未記入ひな型/個人絶対パスなし、個人symlinkと原本が同じファイル/SHA-256であることを確認（`evidence/skill-check.json`）。
- 実リポジトリに調査段階を限定試用。tickets/nextとloadTicketsの現状態を保存（`evidence/tickets.txt`, `next.txt`, `trial-state.json`）。readyなしでもT179 review/依存完了から技術的残件を抽出。curlでloopback /versionが接続拒否・終了7であることを確認（`evidence/local-engine-probe.txt`）。未インストールや許諾未確認を接続拒否から断定しない。
- `./scripts/run --test tests/fact-check-binding.test.ts tests/benchmark-longform.test.ts` は15件全成功/失敗0・終了0（`evidence/trial-regressions.txt`）。T170/T171/T175の古い再監査記録だけを根拠に重複票を作らない判断へ適用。T170自体のsay回帰は今回は再実行せず、T170のdoneと既存修正記録を照合した。
- 作成者による限定試用の観察・判断・次単位案を `evidence/skill-trial.md` に記録。独立エージェントによる試験や新規起票→実装の全工程成功とはしない。
- `git diff --check` 終了0（`evidence/diff-check.txt`）。`scripts/agentctl status tsk_0mvbqr33f5ab4d15d704f --require-metered` はmissing/usage空/終了4（`evidence/metering.txt`）。

## 未実施・制約
- 新規開発チケットの登録、T179のエンジン導入/実合成、動画生成、外部API/契約/課金/push/投稿は行っていない。今回の依頼はSkill作成なので、改善サイクルの実行許可へ拡張しなかった。
- 形式検査と作成者による読み取り調査段階の試用に限定する。他AIによる独立試験、製品ごとの自動発見、新規起票から実装修正までの全工程の実行は未検証。symlinkは原本の場所を変更すれば更新が必要で、自動発見を保証しない。
- 使用量の計測はmissingで未完了。数値補完や計測DB/Hookの変更はしていない。

## TODO・再開方法
- Skill作成・導線・形式検査・限定試用は完了。次回、共有SKILL.mdを指定するか「改善サイクルを回して。対象の課題を調べてチケット化し、進められる改善と検証まで行って」と依頼すれば、対象範囲に適用できる。
- 調査だけの場合は「今回は候補一覧まで」と指定する。既存のT179等はそのチケットの新作業回から進め、新しい独立課題だけ許可範囲で登録する。試用で得たT179案は実施指示/着手済みとは扱わない。
- 今後の実運用で分岐に不足が見つかれば新しい作業回で本Skillを改定する。現在のログの終了後に実績を追記しない。計測は正規Hookの取込後に再確認する。
