---
name: token-monitor
description: このリポジトリの管理対象エージェント実行（agentctl run、Hookで観測した対話・サブエージェント）のトークン使用量・実行時間・費用・再試行を確認し、タスク終了前に計測が完了しているかを検査する。「使用量を確認」「計測できているか」「モデル別の消費」「タスク終了前の計測確認」で使う。計測値を手で補完・推測する用途には使わない。
---
# token-monitor（Claude Code用の入口）

Claude Codeは `.agents/skills/` を自動では探さないため、この入口を置いている。本文の正本は [.agents/skills/token-monitor/SKILL.md](../../../.agents/skills/token-monitor/SKILL.md)。最初にそのファイルを読み、その手順に従う。内容をここへ複製しない。
