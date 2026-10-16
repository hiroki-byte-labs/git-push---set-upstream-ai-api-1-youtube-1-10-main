# 作業記録 T160
- 記録者・実施者: antigravity
- モデル: Gemini 3.8 Flash (Medium) (user-specified)
- 開始日時: 2026-10-16T01:56:56.628Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
サムネイル作成のタスク(T160~)から実施して下さい。
包括許可（2026-10-12）に基づくローカル変更・テスト実行。外部有料API/課金/投稿/pushは対象外。

## 実施内容・変更ファイル
- `src/thumbnail-brief.ts`（新規）:
  - スキーマ `thumbnail-brief@1` と `thumbnail-observation@1` を定義。
  - 4つの構図（contrast, symbol, scene, relationship）、制作素材識別子契約（assertNotObservationAssetによる参考画像URL混入拒否）、場面・出典根拠、未確認事項・needs-review強制契約を定義。
  - Planの主要要素から決定論的SHA-256ハッシュを計算する `calculatePlanThumbnailInputHash` を実装。
  - 旧Plan.thumbnail、title/promise代替、keyword/contrast挙動を維持しつつ新契約へ変換する `convertPlanThumbnailToBrief` を実装。
  - 既存12標本の観察台帳JSONを検証する `validateObservationLedger` を実装。
- `docs/THUMBNAIL-BRIEF-CONTRACT.md`（新規）:
  - 観察台帳と生成briefの契約仕様書。目的・分離原則、スキーマ定義、inputHash計算定義・決定性、needs-review規約、旧Plan互換性、スキーマ更新規則を文書化。
- `tests/thumbnail-brief.test.ts`（新規）:
  - 観察台帳JSONの検証（正常系・異常系・hash・件数・重複拒否）。
  - 参考画像URLの制作素材への流用防止（assertNotObservationAsset拒否）。
  - 旧Plan.thumbnailからの変換・inputHash決定性・3候補生成。
  - 省略値代替挙動の維持（title/promise/keyword/contrast）。
  - 生成briefの検証・拒否（不正hash、候補数不足、重複id、未知構図、空見出し、過長文言、参照先欠落、URL混入）。
  - 未確認事項（unknowns）が存在する場合のneeds-review強制。
- `tickets/T160.md`: statusをdoneへ更新、結果と検証証跡を記載。
- `docs/STATUS.md`: T160の完了記録と次の作業（T161/T162）を追記。

## 判断と理由
- 観察台帳（公開参考画像）と制作素材（自作・許諾素材）の混同・自動変換を防止するため、`assertNotObservationAsset` で `http(s)://` や `ytimg.com` などのURLをassetIdとして受け付けないルールを契約で強制した。
- 未確認事項（unknowns）がある場合に暗黙に成功扱い（ready）へ倒さないよう、unknowns存在時の candidate.status / overallStatus の 'needs-review' 指定を契約レベルでバリデーションし、安全性を担保した。
- 旧Plan.thumbnailやT096（title/promise代替）との後方互換性を損なわないよう、`convertPlanThumbnailToBrief` を用意し、既存の台本からそのまま新brief契約の3候補を決定論的に生成できるようにした。
- 定型作業のSkill化評価（routine-to-skill）: 本作業はサムネイル生成briefと観察台帳の契約スキーマ（TypeScript型・バリデータ・ハッシュ計算・仕様書）を定義する初期設計チケットであり、現時点では反復的な定型手順としての確立・反復実績はなく単発のスキーマ定義であるため、新規Skill化は見送りとした。

## 検証コマンド・結果・証跡
- `node --test tests/thumbnail-brief.test.ts tests/thumbnails.test.ts tests/plan.test.ts`: 34件合格、EXIT=0（証跡: `evidence/test-results.txt`）
- `npx tsc --noEmit`: 型エラー0件、EXIT=0（証跡: `evidence/typecheck.txt`）
- `npm test`: 全体346件合格、EXIT=0（証跡: `evidence/all-tests.txt`）

## 未実施・制約
- 画像の自動取得、AI API呼出し、実PNG描画、採用案の変更、外部素材探索はT160の対象外。
- 次のT161（台本の意味に対応するサムネイル3候補の自動構成）、T162（自作モチーフ・構図レシピ台帳）で後続実装を行う。

## TODO・再開方法
- 次のタスク: T161（3候補自動構成）またはT162（自作モチーフと構図レシピ台帳）。
- `./scripts/run src/cli.ts check` と `next` を実行して確認。
