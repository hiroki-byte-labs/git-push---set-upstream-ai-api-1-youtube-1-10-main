# Antigravity（Gemini）からの入口

共通作業規約は [AGENTS.md](AGENTS.md) が正本です。このファイルは Antigravity・Gemini CLI がワークスペース規約として読むもので、Antigravity で実際に起きた規約違反を繰り返さないための規則を明示します。

## 作業回（作業ログ）の所有 — 必ず守る
- 自分が `worklog-cli.ts start` していない未終了の作業回（`logs/<日付>/<作業ID>/session.json` の status が open）を、`finish`（completed・paused とも）で閉じない。その WORKLOG.md や evidence/ も書き換えない。
- `start` が「未終了作業を先に閉じてください」で失敗したら、作業を止めて、誰の・どの作業回が開いているかを利用者に伝え、指示を待つ。利用者から別のタスクを頼まれたこと、長時間更新がないことは、他者の作業回を閉じる理由にならない。
- 利用者が明示的に「その作業回を閉じてよい」と指示した場合に限り、`--status paused` で閉じ、本文に「Antigravity（モデル名）が利用者の指示で代理で閉じた。元の実施者の作業内容は確認していない」と書く。記録者欄が別のエージェントの記録に、その実施者が判断したかのような文を書かない。
- 自分の作業回の間に自分以外が変更したファイル（`git status`、`find . -newer <自分のsession.json>` で確認できる）を自分の成果として記録しない。気づいたら記録に「自分の変更ではない」と書き、利用者に知らせる。

経緯: 2026-10-11 14:17 UTC、Antigravity（Gemini 3.8 Flash High）が、Claude Code の開始した T121 の作業回（`logs/2026-10-11/141326-T121-a8040365`）を利用者に確認せずに paused で閉じ、その本文に「作業着手前に別タスクの指示があった」と書いて T114 を開始した。T114 の終了記録には、その間に Claude Code が変更したファイルが言及なく含まれた（T121 の作業回 `165046-T121-5721aa8a` で記録を補正）。

## その他（AGENTS.md の要点）
- 別モデル・別製品の実行は `scripts/agentctl run` だけで行う（[.agents/skills/model-router/SKILL.md](.agents/skills/model-router/SKILL.md)）。このフォルダの Hook（`.agents/hooks.json`）が AI CLI の直接起動を拒否する。
- Antigravity のサブエージェントはモデルを指定できないため、Model Router の推奨が親のモデルと違う子作業は拒否される。そのときは `agentctl run` で起動する。
- 作業の開始・終了は [docs/AGENT-WORKFLOW.md](docs/AGENT-WORKFLOW.md) と [.agents/skills/repository-task-closeout/SKILL.md](.agents/skills/repository-task-closeout/SKILL.md) に従う。
