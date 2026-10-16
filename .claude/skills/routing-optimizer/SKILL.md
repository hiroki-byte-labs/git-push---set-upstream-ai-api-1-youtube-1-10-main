---
name: routing-optimizer
description: このリポジトリで蓄積した実行実績から、モデル別・タスク種別別の費用対効果（品質を満たしたタスク1件当たりの総コスト）を分析し、Model Routerの方針の改善案を作る。実績が一定件数たまったとき（agentctl optimize due）またはPMが指示したときだけ使う。毎回の作業開始時や、PMの確認なしに方針を変える用途には使わない。
---
# routing-optimizer（Claude Code用の入口）

Claude Codeは `.agents/skills/` を自動では探さないため、この入口を置いている。本文の正本は [.agents/skills/routing-optimizer/SKILL.md](../../../.agents/skills/routing-optimizer/SKILL.md)。最初にそのファイルを読み、その手順に従う。内容をここへ複製しない。
