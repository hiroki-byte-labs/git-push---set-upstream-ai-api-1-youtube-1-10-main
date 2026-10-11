# 一括実装の結果と引継ぎ（T103・T104・T106・T108、2026-10-10）

作成: 2026-10-10 UTC、Claude Code（claude-opus-5-5）。依頼の案内はdocs/CLAUDE-IMPLEMENTATION-BATCH.md。状態の正本はtickets、詳細は各作業ログ（logs/2026-10-10/）。この文書は時点の引継ぎ。

## 1. 結果（done 3件、review 1件。reviewはdoneに数えない）
| チケット | 状態 | 作業ログ | 内容 | 検証 | 未検証・残り |
|---|---|---|---|---|---|
| T103 新テーマ | **done** | 165146-T103-b861ec0b | theme（general/investment、未指定は投資）とintro（概要欄の導入文）。テーマ別免責。概要欄の出典の構造化（文献名・URL・確認日・場面）。新fixture sample-general.json（統計局の公式ページを出典） | 試験13件追加、隔離生成と実再生（68秒） | スピーカー試聴なし（確認音） |
| T104 本人の工程 | **done** | 170507-T104-634ef8d4 | 制作案件（`produce`）: 題材候補→本人の選択→本人の考察→台本の確認・承認→制作→動画の確認。未入力なら制作を拒否、変更で承認と古い動画が失効、デモと本番の区別 | 試験17件、変異試験4種、実制作込みのCLIの流れ、実ブラウザーでのフォーム送信と409 | 本人の実際の選択・考察・承認はまだ（本人の作業） |
| T106 見せ方 | **review** | 171938-T106-2574f3e3 | 文字ずれの再現と修正（枠に対する中央配置、区画、文字配置の自動検査）、字幕の既定を焼き込みへ、集計の図・経緯の矢印の動き、サムネイル3案、構成案と83秒の試作 | 試験9件、前後比較画像、720p/1080pの統合試作を実再生 | **本人の確認待ち**（構成・動き・サムネイル・字幕・文字ずれ）。参考動画の音声・動き方は未確認 |
| T108 サービス比較 | **done** | 174117-T108-699d0020 | 公式資料12件の確認（日付つき）、比較表、10/20分の想定費用、試聴手順と評価表、推奨案と本人が決める項目 | 費用計算をsrc/budget.tsの関数と独立の式で二重に照合 | 声は聴いていない。実APIは未呼出。資料間の不一致あり |

全テスト191件・型検査成功（最後の作業回の証跡）。契約・有料API・キー取得・課金・クラウド・commit/push・投稿はしていない。既存のoutputs/のジョブは変更していない（新規の確認用フォルダ outputs/T106-review-2026-10-10/ だけ追加）。

## 2. 成果物の場所
- 試作動画・比較画像・サムネイル: outputs/T106-review-2026-10-10/（README.mdに見る順番と質問）
- 構成案・参考動画の観察・指摘への対応: docs/T106-DESIGN.md
- サービス比較・費用・試聴手順: docs/T108-SERVICE-COMPARISON.md
- 設計判断: docs/DECISIONS.md ADR-017（テーマ）、ADR-018（本人の工程）、ADR-019（見せ方）
- 開発用fixture: fixtures/sample-general.json、fixtures/topic-candidates-demo.json、fixtures/draft-general-demo.json、fixtures/draft-price-index.json、fixtures/layout-stress.json（すべて開発用と明記）
- 共有Skill: .agents/skills/sample-render-verification/（隔離生成と実再生の手順。T103で作成、T104で更新、T106で試用）

## 3. 本人が行う操作の例（本番の制作）
エージェントが題材候補（候補.json）と台本の下書き（考察の場面を1つ持つ）を用意した後:
```sh
export NODE_BIN=/path/to/node24
./scripts/run src/cli.ts produce new --candidates 候補.json --by 'エージェント名'        # エージェント
./scripts/run src/cli.ts produce select production-xxxxxxxx --candidate 候補id --by '本人の名前'
./scripts/run src/cli.ts produce reflection production-xxxxxxxx --file 考察.txt --by '本人の名前'
./scripts/run src/cli.ts produce script production-xxxxxxxx --plan 下書き.json --by 'エージェント名'  # エージェント
./scripts/run src/cli.ts produce status production-xxxxxxxx                              # 台本の版を確認
./scripts/run src/cli.ts produce script-review production-xxxxxxxx approve --hash 台本の版 --by '本人の名前'
./scripts/run src/cli.ts produce render production-xxxxxxxx
./scripts/run src/cli.ts serve    # http://127.0.0.1:4173 で完成動画を確認し、確認者名を入れて承認/差戻し
```
選択・考察・台本の確認は確認画面の「制作案件」のページからもできる。本番の案件ではエージェント名で本人の工程を記録できない。投稿は無効のまま。

## 4. 再生成・起動・試験・再開
```sh
./scripts/run src/cli.ts check
./scripts/run --test tests/*.test.ts
./scripts/run node_modules/typescript/bin/tsc --noEmit
./scripts/run src/cli.ts sample --plan fixtures/sample-general.json          # 新テーマのデモ
./scripts/run src/cli.ts sample --plan fixtures/layout-stress.json --resolution 1080  # 文字配置の検査用
./scripts/run src/cli.ts serve
```
再開はcheck→next→各チケットの「ブロック理由と再開」。T106は本人の回答を新しい作業回で記録してから修正・done判断。

## 5. 本人に確認したいこと（課金・契約・投稿の許可は含まない）
**T106（約10分、outputs/T106-review-2026-10-10/README.md）**
1. 構成（導入→身近な例→仕組み→本人の考察→活かし方→まとめ）はイメージに近いですか？
2. 動き（棒が伸びる・矢印が伸びる）は方向として合っていますか？絵（人型・物の絵）がもっと必要ですか？
3. サムネイル a（問い型）/ b（集計の図型）/ c（対比型）のどれが近いですか？
4. 焼き込み字幕（画面下中央・枠つき）の位置と大きさはよいですか？
5. 文字ずれは解消していますか？

**T108（約20分、docs/T108-SERVICE-COMPARISON.md 3章・6章）**
6. 評価文で候補の声を試聴し（AI Studio・ElevenLabsの声のライブラリ。課金なし）、評価表を記入してもらえますか？
7. 台本のGeminiを有料枠で使う方針でよいですか？（無料枠は入力が改善に使われる）
8. 部分映像は、台本と音声が決まるまで保留でよいですか？

**本番の制作を始めるとき（T104）**
9. 最初の題材候補をエージェントに用意させますか？（時事なら公式の一次資料を確認して候補を作る）
