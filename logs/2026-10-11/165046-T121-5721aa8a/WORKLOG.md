# 作業記録 T121
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-11T16:50:46Z / UTC
- 記録種別: 同時記録（16:1x〜16:4x UTCの作業は回顧記録。理由は「判断と理由」）

## 依頼・許可範囲
利用者の指示（2026-10-11）: 作業の続き（16:13〜16:40 UTCに実施したCodex継続・Antigravity長期方針①〜③と実機試験の記録をまとめる）。Antigravityが他者の作業回を利用者の確認なしに閉じないよう、Antigravity側の規約で明示する。
元の依頼（14:13 UTC）: Codex再信頼後の継続。Antigravityのサブエージェントの長期方針 ①規約・Skillに「別モデルや計測が必要な子作業はagentctl run」②models.jsonのnative_subagentsを能力項目（モデル指定・子の使用量・確認した版）に分け、Hookは能力で判断（強制不可の製品は推奨＝親モデルなら許可、違えば拒否してagentctl runへ案内）をパッチで ③doctorに版の変化の検知。調査用の実機試験は各1回まで。

## 実施内容・変更ファイル
- ①: `AGENTS.md`、`.agents/skills/model-router/SKILL.md`（手順5）、`.agents/skills/token-monitor/SKILL.md` に「別モデルや計測が必要な子作業は agentctl run」と製品別の能力を追記。
- ②（保護対象のため一時コピーで作成・検証し、利用者が適用。適用後の4ファイルが検証済みのものと cmp で一致）: `docs/agent-routing/pending-fixes-3.patch`（`orchestration/hooks/hook.ts`・`orchestration/model-registry/models.json`・`orchestration/gateway/config.ts`・`orchestration/tests/hooks.test.ts`）と `pending-fixes-4.patch`（実機結果による models.json の能力・版の更新、`invoke_subagent` の Subagents 内の項目名の記録、`orchestration/tests/doctor.test.ts`・`hooks.test.ts`）。
- ③: `orchestration/gateway/doctor.ts`（版の取得と比較 `version_*`・`version_changed`、Codexデスクトップアプリの版、未計測の表示を missing / unavailable に分割）、`orchestration/tests/doctor.test.ts`。
- 試験中の修正: `orchestration/gateway/gateway.ts`（Antigravityの認証を `agy models` の成功で判定し10分キャッシュ）、`orchestration/telemetry/db.ts`（待機時間を先に設定）、`orchestration/tests/db.test.ts`（新規）。
- 文書: `docs/agent-routing/verification-report.md`（追記3）、`architecture.md`、`operations.md`、`troubleshooting.md`。
- 規約（今回の指示）: `GEMINI.md`（新規。Antigravity側のワークスペース規約として、他者の作業回を閉じない規則と経緯）、`AGENTS.md`（同じ規則を1項目）。
- 記録: `tickets/T121.md`、`docs/STATUS.md`。実機試験のタスクは Git管理外の `work/agentctl-real/`。

## 判断と理由
- 作業回の競合: 14:13 UTCに開始したこの依頼の作業回（141326-T121-a8040365）を、14:17 UTCにAntigravityが利用者の確認なしに paused で閉じ、本文に「作業着手前に別タスクの指示があった」と書いてT114を開始していた。私は利用制限からの再開（16:1x UTC）後に作業回が閉じられていることを確認せずに作業を続け、閉じた作業回の evidence/ に証跡を10件書いた。検査（終了後のログ証跡変更）で気づき、10件を一時領域へ退避して閉じた状態に戻し、利用者に報告して指示を待った。利用者の「続けて」を受け、新しい作業回（本回）で証跡を戻し、この間の変更を回顧として記録した。この間の私の変更は、AntigravityのT114・T071・T115の終了記録に言及なく含まれている（evidence/concurrency-incident.txt）。他者の終了済みログは変更していない。
- 規約の置き場所: Antigravityのローカルの公式文書（~/.gemini/antigravity/builtin/skills/agy-customizations/docs/rules.md）では、ワークスペース規約は各ディレクトリの GEMINI.md / AGENTS.md が自動で読まれる。`.agents/rules/` はこの版の文書に記載がないため使わず、Antigravity専用の入口 GEMINI.md（CLAUDE.md と同じ位置付け）を作り、共通の AGENTS.md にも同じ規則を入れた。print mode には規約を表示するコマンドがなく（`agy -p "/help"` で確認）、読込みの実機確認はモデルのターンが要るため、今回は行っていない。
- 保護対象（hook.ts、models.json）は自分で迂回せず、検証済みパッチを利用者に適用してもらった。Codexの能力を enforced にしたため、「未確認なら止めずに記録する」試験は、テスト用の登録簿の複製で能力を unverified に変えて行う形に分けた。
- Antigravityの認証判定の誤りで拒否された試行は、モデルを呼ぶ前に止まったため許可の「1回」に数えず、修正後に1回実行した。
- 13:46 UTCの `database is locked` は、回帰試験が修正前でも合格し、原因を再現できなかった。待機時間を先に設定する安全側の修正だけ入れ、試験の説明にも再現していないと書いた。

## 検証コマンド・結果・証跡
- パッチ3: 一時コピーで `node --test orchestration/tests/*.test.ts` 68件合格・型検査・`git apply --check`（evidence/pending-fixes-3-tests.txt）。適用後も68件合格（tests-after-patch3.txt）。
- パッチ4: 一時コピーで69件合格（pending-fixes-4-tests.txt）。適用後、doctor の version_* がすべて ok。
- Codexのサブエージェント（`./scripts/agentctl run --task work/agentctl-real/sub-codex-l2.json`、exit 0）: 親 gpt-6.1-sol（59,164トークン）。spawn_agent の呼出しにモデル指定なし、子スレッドは gpt-6-luna（rollout の turn_context、cli 0.162.1）、子は managed=1・親に結び付く・22,882トークン measured（real-run-sub-codex-l2.json、real-subagents-capability.txt）。
- Antigravityのサブエージェント（`sub-agy-l2.json`、exit 0）: 親 gemini-3.8-flash-medium（41,307トークン、input 38,780・output 2,527・thinking 2,435・cache_read 12,213、total=input+output）。`subagent_parent_model_allowed`、子は親と同じモデル、子の使用量 unavailable。spawn_args: Subagents・toolAction・toolSummary（real-run-sub-agy-l2.json）。
- DBの回帰試験: 修正前の再現コピーでも合格（db-before-fix.txt）、修正後も合格（db-after-fix.txt）。
- 全体: 70件合格・型検査 exit 0（tests-final.txt、本回の tests-resume.txt）。`./scripts/agentctl doctor --audit`: 版はすべて ok、未観測セッション0件（Codex 14・Claude 1）、warn は GEMINI_API_KEY 未設定・過去のHookエラー記録・パッチ3前の子1件（doctor-final.json）。
- 競合の経緯: evidence/concurrency-incident.txt（各 session.json の作成・終了時刻と実施者）。

## 未実施・制約
- Antigravityの対話セッションから始めた場合のHook動作、Antigravityが GEMINI.md を読み込んでいることの実機確認（どちらもモデルのターンが要るため未実施）。
- Antigravityの子のモデル指定（Subagents 内の項目は次回の起動で spawn_args に記録される）。
- Claude CLIのログイン後のGateway経由のClaude実行、コマンド本文の文字列による誤判定の修正、`database is locked` の原因、コスト削減の実測。
- 定型作業の評価: 「保護対象の変更は一時コピーで検証済みパッチを作り、利用者が適用し、cmpで一致を確かめる」をこの日に4回（pending-hook-fixes、pending-fixes-2〜4）行った。手順は docs/agent-routing/setup.md 8章（保守モード）と verification-report.md に事実として残っているが、パッチの作り方（tar で複製→修正→diff→git apply --check→利用者が適用→cmp）は書かれていないため、次回に同じ作業が出た時点で model-router Skill の保守の節へ追記する（今回は記録の補正を優先し見送り）。

## TODO・再開方法
- tickets/T121.md「ブロック理由と再開」の1〜4。いずれも新しい作業回で行い、実機試験は利用者の許可を得てから。
- Antigravityの作業でも、開始前に `./scripts/run src/cli.ts check` で未終了の作業回を確かめ、他者の作業回を閉じないこと（GEMINI.md）。
