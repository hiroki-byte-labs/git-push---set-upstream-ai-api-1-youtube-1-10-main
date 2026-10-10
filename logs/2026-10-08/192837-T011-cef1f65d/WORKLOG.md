# T011 定型作業をSkill化するSkillの作成・適用
- 実施者・記録者: Codex
- モデル: GPT-6 Astra（user-specified / ユーザー指定表記）
- 開始: 2026-10-08T19:28:37Z / UTC（session.json参照）
- 記録種別: 同時記録

## 依頼・許可範囲
ユーザー原文: 「作業実施時に定型作業が発生していたらSkillsにするようにするSkillsを作成して実行してください」
Skill作成と今回作業への実適用。既存の契約・課金・公開・push・投稿境界を維持。特定AIを優先しない共通原本とする。

## 実施内容・変更ファイル
開始時README/SPEC/STATUS/共通ワークフロー、T010の結果と依存、check/nextを確認。18件と既存ログ1件の検査成功。skill-creatorを読んで適用した。T011を作成し共通startを実行。
.agents/skills/routine-to-skill/SKILL.mdを作成し、実際に内容を読み、T009/T010/T011で反復する作業を評価した。evidence/skill-extraction.mdに候補・根拠・採否を保存。
最も有効な候補として、終了時の検証・チケット・STATUS・ログ更新をrepository-task-closeoutへ抽出。新Skillを読み、今回の既存sessionを使って終了準備を実施。再帰的なメタSkill作成や無関係な自動化は行わない。
AGENTS/README/AGENT-WORKFLOW/STATUS/DECISIONSへ定型作業評価と共通原本への導線を追加。個人の~/.codex/skillsへ同名ディレクトリがないことを確認し、2つのSKILL.mdをコピーした。原本とコピーのSHA-256一致はevidence/installation.json。

## 判断と理由
- 汎用の作成支援は既存skill-creatorを使い、今回のメタSkillには反復の発見・採否・実適用を集中させる。
- 終了手順のCLIや規約は複製せず、現在の正本を参照するSkillにした。特にfinish後に証跡追記して検査を壊さない順序を明記。
- 毎回新Skillを作るのではなく、既存更新または見送りを認め、反復の根拠と理由を残す。
- 共有原本は.agents/skills。どのAIでも明示的に読める。個人コピーは当該環境の発見用で、唯一の正本ではない。
- 手順の文章のみで足りるため、補助実行コードやUI設定は追加しない。

## 検証コマンド・結果・証跡
skill-creator/scripts/quick_validate.pyを両Skillに実行。初回はModuleNotFoundError: yamlで失敗。PyYAML==6.0.2をwork/skill-validationへpipで追加し、PYTHONPATHを指定して再実行した。
evidence/meta-validation.txtとcloseout-validation.txtはいずれもSkill is valid!。形式検証であり意思決定の全面保証ではない。
適用対象の実績はevidence/repetition.txt。候補の評価・既存機能との重複確認・机上の境界検討はevidence/skill-extraction.md。個人コピーの一致を検証し、既存Skillは上書きしなかった。
アプリコードを変更していないため従来24件のコード試験や動画生成は今回再実行しない。最後に共通finish/checkを行い、終了状態とハッシュはsession.jsonで記録する。

## 未実施・制約
他AI製品の実機、次回セッションでの自動発見、独立サブエージェント試験は未実施。今回作成したSkillは明示的に読んで適用した。指示を読まない外部AIを強制する仕組みではなく、自動起動を保証しない。
T006の実再生は未確認のまま。新規の有料API・投稿・pushなし。個人Skillコピーはソース更新後に同期が必要。

## TODO・再開方法
新しい作業終了前にroutine-to-skillで候補を評価し、作成/更新/見送りをログへ残す。終了処理はrepository-task-closeoutと共通ワークフローに従う。今回は評価済みなので同じ作業回で再評価しない。
human=T007の視聴、agent=T006の制約解消後検証とT020/T030の独立調査は継続。引き渡し用のskills.zip、source.zip、logs.zipはGit除外outputsへ出し、最後にcheckを再確認する。
