---
name: model-router
description: このリポジトリで別のAIモデル・別製品（Codex / Claude Code / Antigravity / Gemini API）へ作業を任せる前、またはサブエージェントを起動する前に、タスクの難易度（L0〜L4）と品質要求から実行モデルを決め、agentctl経由で承認つきの実行にする。「別モデルに任せたい」「サブエージェントを使う」「どのモデルで実行するか」と判断するときに使う。今実行中の自分のモデルを切り替える用途には使えない。
---
# model-router（Claude Code用の入口）

Claude Codeは `.agents/skills/` を自動では探さないため、この入口を置いている。本文の正本は [.agents/skills/model-router/SKILL.md](../../../.agents/skills/model-router/SKILL.md)。最初にそのファイルを読み、その手順に従う。内容をここへ複製しない。
