# Git ワーキングツリー長期未コミット作業差分の段階的整理計画書 (T176)

本ドキュメントは、T112〜T175にわたってワーキングツリーに滞留していた未コミット作業差分および未追跡ファイルを、機能・チケット単位で論理的に分割し、段階的にコミットするための指針と手順を規定する。

---

## 1. 基本方針・制約
1. **リモート反映（git push）の禁止**:
   - 作業はローカルリポジトリ（ブランチ: `main`）内でのコミットのみとし、`git push` は実行しない。
2. **コミット独立性と整合性**:
   - 各コミット完了時点で、リポジトリの主要テスト（`npm test`、`npm run typecheck`）および `./scripts/run src/cli.ts check` の整合性を維持する。
   - 依存関係の順序に従い、基盤・インフラ → 独立機能モジュール → 統合・制作パイプライン → チケット・作業ログの順でコミットする。
3. **機密・一時生成物の除外**:
   - `telemetry.db`、`auth-cache.json`、`outputs/` 配下の動画・音声バイナリ、一時キャッシュは `.gitignore` によりコミット対象から除外する。

---

## 2. 段階的コミット構成案（6段階）

### Commit 1: エージェント運用基盤・Model Router・監視・自律実行フレームワーク (T112〜T129)
- **概要**: 複数AIエージェント（Claude, Codex, Antigravity, Gemini API）の統合運用、Model Router、Token Monitor、承認ゲート、実行ログ計測基盤。
- **対象ファイル**:
  - `.gitignore` (data/* 除外等の追加)
  - `data/README.md`
  - `.agents/`（`agents/`, `hooks.json`, `skills/model-router/`, `skills/routing-optimizer/`, `skills/token-monitor/`, `skills/task-work-units/`, `skills/repository-task-closeout/`, `skills/sample-render-verification/`）
  - `.claude/`, `.codex/`
  - `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`
  - `orchestration/` 全体
  - `schemas/` 全体
  - `scripts/agentctl`, `scripts/agentctl-hook`
  - `docs/agent-routing/`, `docs/AUTONOMOUS-DOCUMENTARY-PIPELINE.md`, `docs/PRIORITY-TASKS-2026-10-11.md`, `docs/PRIORITY-WORK-UNITS.md`, `docs/PROJECT-STATUS-*`, `docs/AGENT-INDEPENDENT-WORK-*`
- **検証手順**:
  - `npm run typecheck`

### Commit 2: 題材リサーチ・企画・トレンドAPI基盤 (T130〜T137)
- **概要**: YouTube・Google Trends等からの題材収集、正規化、メトリクス算出、レポート生成、およびドキュメンタリー題材リサーチSkill。
- **対象ファイル**:
  - `src/trends-schema.ts`, `src/trends-store.ts`, `src/trends-collect.ts`, `src/trends-metrics.ts`, `src/trends-report.ts`, `src/trends-cli.ts`
  - `tests/trends-*.test.ts`
  - `fixtures/trends/`, `fixtures/candidates-documentary.json`, `fixtures/research-report-documentary.md`
  - `docs/RESEARCH-TRENDS-API.md`, `docs/TRENDS-METRICS.md`, `docs/TRENDS-OPERATIONS.md`
  - `.agents/skills/topic-research/`
  - `tests/topic-research.test.ts`
- **検証手順**:
  - `npx vitest run tests/trends-*.test.ts tests/topic-research.test.ts`

### Commit 3: ドキュメンタリー演出・Remotion拡張・図解・可読性基盤 (T144, T145, T149, T150, T152〜T158)
- **概要**: Remotionモーション検証環境（motion-lab）、標準図解（棒・折れ線・円・ベン図・フロー）、ピクトグラム・シルエット演出、720p/1080p可読性保証、AVPlayer再生検証。
- **対象ファイル**:
  - `motion-lab/`（`src/primitives/`, `src/PlanVideo.tsx`, `src/PrologueQuestion.tsx`, `src/StandardDiagram.tsx`, `src/diagram-timing.ts`, `src/layout-probe.tsx`, `src/remotion-plan.ts`, `tests/`, `tools/`, `shared/`, `Root.tsx`, `tsconfig.json`）
  - `src/remotion-visual.ts`, `src/remotion-layout.ts`, `src/remotion-media.ts`, `src/illustration.ts`
  - `src/readability.ts`, `src/layout.ts`, `src/timeline.ts`
  - `assets/pictograms/`, `assets/audio/`
  - `analysis/`
  - `fixtures/remotion-layout-*`, `fixtures/sample-standard-diagrams.json`, `fixtures/sample-*-illustration.json`, `fixtures/sample-source-labels.json`, `fixtures/sample-subtitle-timing.json`
  - `tests/remotion-layout.test.ts`, `tests/remotion-media.test.ts`, `tests/readability-gate.test.ts`, `tests/illustration.test.ts`
  - `scripts/verify-avplayer-playback.swift`, `scripts/render.swift`
  - `docs/REFERENCE-STYLE-POLICY.md`, `docs/T145-*`, `docs/T149-*`, `docs/T150-*`, `docs/T151-*`, `docs/T155-REMOTION-LAYOUT.md`, `docs/ASSETS.md`, `docs/PRODUCTION-GUIDELINES.md`
- **検証手順**:
  - `npx vitest run tests/remotion-layout.test.ts tests/readability-gate.test.ts tests/illustration.test.ts`

### Commit 4: サムネイル制作パイプライン・評価・検査・選定 (T159〜T167, T169)
- **概要**: 構図レシピ（対比・問いかけ・数字・単独・分岐）、Swiftネイティブ描画（render-thumbnail.swift）、コントラスト・セーフティ・破綻検査ゲート、プレビュー一覧・レビューパッケージ生成。
- **対象ファイル**:
  - `src/thumbnail-brief.ts`, `src/thumbnail-candidates.ts`, `src/thumbnail-recipes.ts`, `src/thumbnail-renderer.ts`, `src/thumbnails.ts`
  - `tests/thumbnail-*.test.ts`, `tests/thumbnails.test.ts`, `tests/serve-thumbnail.test.ts`, `tests/review-thumbnail-integrity.test.ts`
  - `scripts/generate-thumbnail-previews.ts`, `scripts/generate-thumbnail-review-package.ts`, `scripts/render-thumbnail.swift`
  - `assets/thumbnail-originals/`
  - `docs/THUMBNAIL-BRIEF-CONTRACT.md`, `docs/T159-THUMBNAIL-ANALYSIS-2026-10-16.md`, `docs/T167-THUMBNAIL-REVIEW-PACKAGE.md`
- **検証手順**:
  - `npx vitest run tests/thumbnail-*.test.ts tests/thumbnails.test.ts`

### Commit 5: 音声合成・事実権利確認・キュー基盤・台本・字幕・耐久ベンチマーク (T138, T140, T141, T146, T147, T148, T170〜T175)
- **概要**: macOS sayローカル音声パイプライン、事実・権利確認エンジン、ローカル永続化ジョブキューアダプター、字幕文節・助詞最適化、10〜20分長尺ベンチマーク、制作パイプライン統合。
- **対象ファイル**:
  - `src/local-say-audio.ts`, `src/audio-pipeline.ts`, `src/mock-audio-media.ts`, `src/mock-audio-media-cli.ts`, `src/narration.ts`
  - `src/fact-check.ts`, `src/checklist.ts`
  - `src/local-queue.ts`, `src/queue-adapter.ts`, `src/mock-publisher.ts`, `src/orchestration-pipeline.ts`
  - `src/subtitle-optimizer.ts`
  - `scripts/benchmark-longform.ts`
  - `src/cli.ts`, `src/commands/`, `src/metadata.ts`, `src/plan.ts`, `src/production.ts`, `src/providers.ts`, `src/review.ts`, `src/lint.ts`
  - `.agents/skills/fact-and-rights-check/`, `.agents/skills/narration-evaluation/`, `.agents/skills/script-drafting/`
  - `fixtures/checklist-demo.json`, `fixtures/draft-documentary-superstar.json`, `fixtures/fact-check-superstar.*`, `fixtures/narration-evaluation-superstar.*`
  - `docs/T084-CHECKLIST.md`, `docs/T106-FOLLOWUP-WORK-2026-10-15.md`, `docs/T138-MOCK-AUDIO.md`, `docs/DECISIONS.md`, `docs/SPEC.md`, `README.md`
  - `tests/audio-pipeline.test.ts`, `tests/benchmark-longform.test.ts`, `tests/checklist.test.ts`, `tests/documentary-pipeline-e2e.test.ts`, `tests/fact-and-rights-check.test.ts`, `tests/local-queue.test.ts`, `tests/local-say-audio.test.ts`, `tests/mock-audio-media.test.ts`, `tests/mock-publisher.test.ts`, `tests/narration-evaluation.test.ts`, `tests/orchestration-pipeline.test.ts`, `tests/produce-fact-check.test.ts`, `tests/queue-adapter.test.ts`, `tests/script-drafting.test.ts`, `tests/subtitle-optimizer.test.ts`, `tests/metadata.test.ts`, `tests/plan.test.ts`, `tests/production.test.ts`
- **検証手順**:
  - `npm test` (全テストスイート)

### Commit 6: チケット定義（T112〜T176）、作業ログ（logs/2026-10-11〜16）、およびステータス管理
- **概要**: これまでの各タスクのチケット（T025, T026, T071, T084, T106, T111, T112〜T176）、詳細作業ログ（WORKLOG.md/session.json/evidence）、および docs/STATUS.md の正本コミット。
- **対象ファイル**:
  - `tickets/`
  - `logs/`
  - `docs/STATUS.md`
  - `docs/GIT-CLEANUP-PLAN.md`
- **検証手順**:
  - `./scripts/run src/cli.ts check`
  - `git status` がクリーンであることを確認
