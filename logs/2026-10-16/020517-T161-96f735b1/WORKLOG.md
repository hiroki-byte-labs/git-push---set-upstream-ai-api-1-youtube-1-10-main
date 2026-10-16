# 作業記録 T161
- 記録者・実施者: antigravity
- モデル: Gemini 3.8 Flash (Medium) (user-specified)
- 開始日時: 2026-10-16T02:05:17.616Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T161以降のチケットもすべて実施して下さい。
包括許可（2026-10-12）に基づくローカル変更・テスト実行。外部有料API/課金/投稿/pushは対象外。

## 実施内容・変更ファイル
- `src/thumbnail-candidates.ts`（新規）:
  - 承認済みPlanから決定論的に3候補（a: 象徴・問い型、b: 左右対比型、c: 関係・メカニズム・情景型）を構成する `buildThumbnailCandidates` を実装。
  - 各候補の文言・図像をPlanの場面（sceneIndex, sceneTitle）および出典（sourceIds）へ厳密に追跡。
  - 読点・助詞・問い句の境界で安全に短縮する `shortenMeaningfully` を実装し、機械的な末尾切り捨てを排除。
  - 実質同一な見出し（文末記号違い等）や構図3重出力を検知・排除し、重複を回避できない場合は `needs-review` で安全停止。
  - 禁止表現（FORBIDDEN）および根拠のない数値表現（NUMERIC_CLAIM）の自動検出と `needs-review` 強制。
- `tests/thumbnail-candidates.test.ts`（新規）:
  - 3題材（格差・名字・寛容）での異なる3候補構成と決定論的一致。
  - 禁止表現検出時の `needs-review` 停止。
  - 実質同一見出し検出時の `needs-review` 停止。
  - 意味単位の短縮処理の安全性検証。
- `tickets/T161.md`: statusをdoneへ更新、結果と検証証跡を記載。
- `docs/STATUS.md`: T161の完了記録と次の作業（T162/T163）を追記。

## 判断と理由
- 単なる文末記号（「？」や「！」）の追加や、人工的な接尾辞（「〜の構造」「〜の真相」）による形式的な文字列水増しを避け、Plan内の異なる場面・章見出しから本質的に異なる訴求の3案を抽出する設計とした。
- タイトルや補足の短縮において、文字数切り詰め（slice）で不自然な単語切断が生じないよう、読点や助詞の境界で意味の通る単位で切り詰める `shortenMeaningfully` を導入した。
- 定型作業のSkill化評価（routine-to-skill）: 本作業はPlanからのサムネイル候補生成ロジックの実装であり、現時点では反復的な定型手順としての確立・反復実績はなく、後続のT162〜T167で描画・パイプライン統合・評価が進む過程にあるため、新規Skill化は見送りとした。

## 検証コマンド・結果・証跡
- `node --test tests/thumbnail-candidates.test.ts tests/thumbnail-brief.test.ts`: 11件合格、EXIT=0（証跡: `evidence/test-results.txt`）
- `npx tsc --noEmit`: 型エラー0件、EXIT=0（証跡: `evidence/typecheck.txt`）
- `npm test`: 全体350件合格、EXIT=0（証跡: `evidence/all-tests.txt`）

## 未実施・制約
- 専用PNG描画や画像生成はT161の対象外（T163で担当）。
- 素材台帳とレシピの整備はT162で担当。

## TODO・再開方法
- 次のタスク: T162（題材固有の自作サムネイルモチーフと構図レシピを用意する）および T163（動画から独立したサムネイル専用PNG描画経路を実装する）。
- `./scripts/run src/cli.ts check` と `next` を実行して確認。
