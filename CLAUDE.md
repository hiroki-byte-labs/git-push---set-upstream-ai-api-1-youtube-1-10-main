# Claude Codeからの入口

共通作業規約は [AGENTS.md](AGENTS.md) が正本です。開始前に全文と [docs/AGENT-WORKFLOW.md](docs/AGENT-WORKFLOW.md) を読み、チケットとログの同じ検査を使ってください。

動画解析・再現の担当定義は `.claude/agents/`、工程は [orchestration/README.md](orchestration/README.md)、共通Skillは `.agents/skills/multi-product-motion/SKILL.md` です。Skillの自動検出に依存せず、ファイルを明示的に読んでください。役割名は `animation-director` / `remotion-developer` / `render-engineer` / `animation-refiner`。

単独作業ではstartからfinishまで記録します。既存の親作業回で委譲された場合、子は同じログをstart/finishせず、担当ファイルだけ変更して実行結果・未実施・再開条件を親へ返します。同じ作業ツリーのチケット・STATUS・WORKLOGは親だけが更新します。

参考動画・解析JSON・生成物・評価・改善タスクを版で対応させ、別製品への引継ぎはファイルと検査結果で行います。自分で未実行のAntigravity/Codex処理を実行済みと記載しないでください。

モデル選択・トークン計測・ルーティング改善は共通Skill `.agents/skills/model-router/`・`token-monitor/`・`routing-optimizer/` が正本（Claude Code用の入口は `.claude/skills/`）。AI CLIの直接起動はHook（`.claude/settings.json`）が拒否するため `scripts/agentctl run` を使う。仕組みと制約は [docs/agent-routing/architecture.md](docs/agent-routing/architecture.md)。
