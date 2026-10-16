# 作業記録 T071
- 記録者・実施者: Antigravity
- モデル: Gemini 3.8 Flash (High) (user-specified)
- 開始日時: 2026-10-11T16:40:27.535Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
AI利用と人の監修を概要欄・開示設定に表示する（T071）

## 実施内容・変更ファイル
- `src/plan.ts`:
  - `AiDisclosure` 型および `DEFAULT_AI_DISCLOSURE` 定義を追加。
  - `Plan` 型に `aiDisclosure?: AiDisclosure`（利用範囲、監修者、人間による確認項目、現実合成有無）を追加。
  - `LIMITS` に上限定義を追加し、`validatePlanV2` にバリデーションを追加。
- `src/metadata.ts`:
  - YouTube公式ポリシー（G20）に基づく改変・合成コンテンツ判定関数 `evaluateSyntheticMedia` を実装。
  - 概要欄向けのAI利用・人の監修定型説明文生成関数 `formatAiDisclosure` を実装。
  - `Metadata` 型に `aiDisclosureText` と `syntheticMedia`（containsSyntheticMedia, reason）を追加。
  - `buildMetadata` で概要欄（description）に説明文を挿入。
- `src/commands/serve.ts`:
  - ジョブ詳細確認画面（`detailPage`）に「AI利用と開示設定」セクションを追加し、YouTube開示要否（containsSyntheticMedia）と判定理由、概要欄の説明文を表示。
- `tests/metadata.test.ts`, `tests/plan.test.ts`:
  - T071用の単体テストを追加。
- `tickets/T071.md`:
  - 結果と検証証跡を記録し、ステータスをdoneに更新。
- `docs/STATUS.md`:
  - T071完了の記録を先頭に追記。
- 定型作業評価（routine-to-skill）:
  - 今回の作業はメタデータ生成ルールおよびUI表示の機能追加であり、既存のSkill群（remotion-best-practicesやrouting等）とは異なる個別仕様実装のため、新規Skill化の対象となる反復的定型手順はないと評価。

## 判断と理由
- YouTube公式開示ポリシー（G20）との整合: アニメーション・図解モーショングラフィックスおよび制作補助としてのAI利用は開示義務の対象外（containsSyntheticMedia: false）とし、現実と誤認しうる合成（実写ディープフェイク等）が指定された場合のみtrueとする判定ロジックとした。
- 信頼性低下の防止（G21〜G22）: 単に「AI生成」とだけ書くことによる信頼低下（完全自動生成との誤解）を防ぐため、AIが担った範囲（構成案・図解配置等）と、人間が確認・検証した項目（出典照合、事実確認、最終目視）を明記するフォーマットを採用。

## 検証コマンド・結果・証跡
- `./scripts/run --test tests/metadata.test.ts`: 10件全パス（evidence/test-metadata.txt）。
- `./scripts/run --test tests/plan.test.ts`: 18件全パス（evidence/test-plan.txt）。
- `./scripts/run --test`: 全302件のテストすべて合格（エラー0件）。
- `./scripts/run src/cli.ts sample`: サンプルジョブを生成し、`metadata.json` に説明文と開示判定が正しく出力されることを確認（evidence/sample-metadata.json）。
- TypeScript型検査: エラー0件（ステータス0）。

## 未実施・制約
- YouTubeへの実際の投稿実行（T032のスコープ、Publisher無効のまま）。

## TODO・再開方法
- T071完了。
- 続いてユーザー指定の残りタスクである T115（動画からの高FPSフレーム抽出とタイムスタンプ測定ツール整備）に着手する。
