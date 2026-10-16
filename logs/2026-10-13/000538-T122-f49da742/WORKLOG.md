# 作業記録 T122
- 記録者・実施者: Antigravity
- モデル: Gemini 3.8 Flash (High) (user-specified)
- 開始日時: 2026-10-13T00:05:38.283Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
- 依頼: 前提タスク（T122・T124・T125）の実装から順に進める（T122企画、T124事実確認、T125音声評価Skillを実装完了し、後続のT123・T127・T128・T129へ繋げる）。
- 許可範囲: T122（企画・情報整理を支援する題材候補と根拠資料の作成手順を整備する）のSkill整備、候補データ作成、テスト実装、型検査。

## 実施内容・変更ファイル
1. **共有Skill作成 (`.agents/skills/topic-research/SKILL.md`)**:
   - 参考動画10本の分析に基づく企画フレームワーク（「日常の素朴な疑問や不条理」×【二重の学術フック】、Paradox → Mechanism → Reflection の3段構成）を定義。
   - 事実（Fact）・推論（Inference）・未確認（Unverified）の厳格分離原則を策定。
   - 制作パイプライン（`cli.ts produce new`）向け `candidates.json` および本人の検討用 `research-report.md` の成果物形式仕様と連携手順を規定。
2. **サンプル題材候補作成 (`fixtures/candidates-documentary.json`)**:
   - 分析動画と同系統の学術探究テーマ3件（スーパースター経済学、名字絶滅、寛容のパラドックス）を定義。
   - 各候補に一次文献の書誌情報および有効なHTTPS URL（JSTOR等）、問い、概念、具体例を整備。
3. **根拠資料レポート作成 (`fixtures/research-report-documentary.md`)**:
   - 3候補の詳細な因果メカニズム解説、視覚メタファー（スポットライト、メーター、二項対立カード等）の提案、一次資料・事実・推論・未確認の判定表を整理。
4. **自動テスト作成 (`tests/topic-research.test.ts`)**:
   - Skillドキュメント構造検査、`validateCandidates` スキーマ適合検査、デモ案件作成（`createProject`）検査、根拠資料レポート構造検査の4件を実装。
5. **ドキュメント更新**:
   - `tickets/T122.md` を `status: done` に更新し、結果と検証証跡を記載。
   - `docs/STATUS.md` にT122完了記録を追記。

## 判断と理由
- **事実・推論・未確認の厳格分離**: 知的好奇心ドキュメンタリーでは提示数値や主張の信頼性が極めて重要であるため、学術論文に記載された数理・実験データ（Fact）、モデルの解釈（Inference）、反証余地や仮説（Unverified）を明確に分ける表形式を必須とした。
- **既存制作パイプラインとの完全互換**: 題材候補のJSON形式を `src/production.ts` の `validateCandidates` に適合させ、`produce new --candidates ...` コマンドでそのまま制作案件を起こせるようにした。

## 検証コマンド・結果・証跡
- **単体テスト実行**:
  - コマンド: `./scripts/run --test tests/topic-research.test.ts`
  - 結果: 4 pass / 0 fail（合格）
- **全体テスト実行**:
  - コマンド: `./scripts/run --test`
  - 結果: 325 pass / 0 fail（全件合格）
- **TypeScript型検査**:
  - コマンド: `npx tsc --noEmit && npx tsc -p motion-lab/tsconfig.json --noEmit`
  - 結果: エラー0件（合格）
- **証跡**:
  - `logs/2026-10-13/000538-T122-f49da742/evidence/topic-research-test.txt`

## 定型作業評価（routine-to-skill）
- 今回整備した手順そのものが、定型的なリサーチワークフローを共有Skill化した `.agents/skills/topic-research/` である。これにより、任意のAIエージェントが本PJのドキュメンタリー品質基準に適合した題材リサーチを再現可能となった。
- 当該Skillの初回作成および単体テストによる検証が完了したため、追加のSkill化作業は不要。

## 未実施・制約
- 本人の最終的な題材採否の決定、考察本文の執筆は本人の作業工程（`produce select` / `produce reflection`）に委ねる。
- 有料外部リサーチAPIの直接利用は行わない。

## TODO・再開方法
- 後続タスク: T124（出典・事実確認と素材利用権確認Skill）、T125（自然なナレーション生成・試聴評価Skill）、およびT123（台本下書きSkill）。
- 次回作業は `./scripts/run src/cli.ts next` で着手可能タスクを確認して開始する。
