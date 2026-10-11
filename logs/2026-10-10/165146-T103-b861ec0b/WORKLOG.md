# 作業記録 T103
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-10T16:51:46.614Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
docs/CLAUDE-IMPLEMENTATION-BATCH.mdに基づくT103/T104/T106/T108一括実装依頼のうちT103（新テーマのテーマ別免責・導入文・出典の概要欄出力・新fixture・隔離生成と実再生）を実装・検証・記録する。契約・有料API・キー取得・クラウド・commit/push・投稿はしない。本人の題材選定・考察・承認は代行しない。
利用者の依頼文（チャット）: このリポジトリのAGENTS.mdとdocs/CLAUDE-IMPLEMENTATION-BATCH.mdを読み、T103、T104、T106、T108を順に実装・検証・記録する。無料のローカル作業で進められる全件を実施し、1チケットを閉じてから次を開始する。公式情報の読取調査、ローカル実装、無料の描画・試験は可。

## 実施内容・変更ファイル
小単位103-1〜103-6を順に実施。
- 103-1 設計: 台本v2に任意欄`theme`（general/investment）と`intro`（text・sources・fictional）。theme未指定は旧形式として投資扱い。docs/DECISIONS.md ADR-017。
- 103-2 先行試験: tests/theme.test.ts（13件。一般の正常/免責欠落/保証肯定/出典なし数値・利益保証・結果保証・煽り/投資語の混入、投資の正常/禁止表現/保証肯定/推奨免責欠落、未知のtheme、旧形式、theme付け替え、導入文lint、概要欄、新fixture）。
- 103-3 実装: src/plan.ts（THEMES、themeOf、Intro、検証）、src/lint.ts（requiredDisclaimer、checkDisclaimerの対象語指定、INVESTMENT_TERMS、効果・結果の断定を禁止表現へ、intro-missing/intro-source、導入文の禁止表現・数値、導入文の出典を使用に算入）、prompts/script.md。
- 103-4 概要欄: src/metadata.ts（導入文を先頭、sourceRecords・SourceRecord・SOURCES_NOTE、metadata.jsonにintro/sources/sourcesNote）、src/channel.ts（sourcesTextの番号付けをsourceRecordsへ一本化。表記は従来どおり）。
- 103-5 fixture: fixtures/sample-general.json（物価と消費者物価指数、7場面68秒、4章、架空の例を明示、出典は総務省統計局の公式ページ）。scripts/render.swift（章がない台本の札をthemeで切替）。
- 103-6 隔離生成と実再生（下記の検証）。
- 文書: README.md、docs/SPEC.md、docs/STATUS.md、tickets/T103.md。tests/lint.test.ts の1件を規則ごとの判定へ変更。
- Skill: .agents/skills/sample-render-verification/SKILL.md を新規作成。

## 判断と理由
- theme未指定を投資扱いにした: 既存の投資fixtureを一般テーマへ読み替えると推奨の免責が外れ、検査を回避できてしまうため（批判的な指示「既存の投資fixtureが一般テーマ扱いになり検査を回避しないこと」）。
- 一般テーマにも軽い免責（結果を保証しない否定文）を課した: config/channel.jsonの免責文（実践による結果を保証するものではない）と整合し、「一般テーマの免責欠落」を検出できるようにするため。投資の定型免責（推奨）は課さない。最終場面の「推奨」の肯定（例: 公的機関が推奨している）は一般テーマでは誤検出になりやすいので対象外にした。
- themeの付け替えで検査を外せないよう、一般テーマでも投資の語があれば投資の免責を要求し、禁止表現・出典なし数値・具体例の区別・サムネイル文言はテーマ非依存のまま。
- 導入文は具体例と同じく「出典つきか架空の明示」を必須とし、ニュースの捏造を防ぐ。欠落は既存の構成規則と同じく本番尺error・試作warning。
- 出典URLの記録を検証済みと誤認しないようsourcesNoteを保存し、主張との照合は人の台本確認（T104）に委ねた。
- 題材は利用者が希望した「経済ニュースにつながる基礎用語」に合わせ、数値や最新結果を使わず定義だけを公式ページから言い換えた（出典の取得方法はevidence/source-check.txt）。
- 演出の指針（docs/PRODUCTION-GUIDELINES.md）の追加前チェック: 今回は演出の追加なし（章のない台本の札の文言だけ変更）。
- routine-to-skill評価: 隔離コピーでの生成→媒体検査→ブラウザー実再生→実デコードフレームの目視は、T006（実再生）、T093（隔離再現）、今回T103で反復し、同じ依頼のT106でも必要。既存のrepository-task-closeoutは証跡と隔離生成の原則までで、再生手順（非表示ペインでミュート動画が約20秒ごとに一時停止される対処、映像面がスクリーンショットに出ない場合のフレーム抽出、確認音の書き方）は未収録のため、新規Skill sample-render-verificationとして作成した。今回の103-6はこの手順そのもの（作成の元）で、次のT106-6で試用する。同じ作業回での再評価やメタSkillは作らない。

## 検証コマンド・結果・証跡
- 修正前: `./scripts/run --test tests/theme.test.ts` → SyntaxError（../src/plan.tsにthemeOfがない）、EXIT=1。evidence/before-fix.txt。
- 修正後（対象）: `./scripts/run --test tests/theme.test.ts tests/plan.test.ts tests/lint.test.ts tests/metadata.test.ts tests/channel.test.ts tests/thumbnails.test.ts` → tests 79 / pass 79 / fail 0、EXIT=0。evidence/after-fix.txt。
- 全体: `./scripts/run --test tests/*.test.ts` → tests 165 / pass 165 / fail 0、EXIT=0。evidence/all-tests.txt。途中で「未使用の出典はwarningのみ」が導入文warningの追加で失敗（165中1件）し、警告総数ではなく規則ごとの判定へ修正した。
- 型検査: `./scripts/run node_modules/typescript/bin/tsc --noEmit` → EXIT=0。evidence/typecheck.txt。
- CLI: `cli.ts lint --plan` を3つのfixtureで実行。sample-general error0/warning0、sample-v2 error0/warning1（導入文の欠落）、sample.json error0/warning6。evidence/cli-lint.txt。
- 出典確認: 統計局の公式ページを取得・復号し、使用した記述と台本の対応を記録。evidence/source-check.txt。
- 隔離生成: scratchpadの隔離コピーで `sample --plan fixtures/sample-general.json` → 生成完了（約30秒）。68秒、1632/1632フレーム、全デコード、PSNR最小38.9dB、soft字幕1本、lint error0/warning0、metadata ok（チャプター4、導入文、出典1件の場面4・5と導入文での使用）、見やすさok、サムネイル3案ok。evidence/sample-general/（metadata.json、media-check.json、lint.json、job.json、subtitles.vtt、sources.txt、scene-images.png、decoded-frames.png）。
- 実再生: 隔離コピーでserveし、組み込みブラウザーで再生。readyState4、1280×720、68秒、最後まで再生してended、14cueすべて表示、dropped 0、音声デコードのバイト数が増加。音声は確認音。詳細はevidence/playback.md。

## 未実施・制約
- スピーカーでの試聴はしていない（音声は自作の確認音でナレーションではない）。ブラウザーペインが非表示のため、再生中の映像面はスクリーンショットに描画されず、代わりにMP4から実デコードしたフレームで目視した。
- 新fixtureは68秒の短い試作で、10〜20分の長尺品質の検証ではない。本人の題材選定・考察・台本承認を経た台本ではない。
- 統計局ページの定義以外（指数の算式、品目数、最新の結果値）は確認・使用していない。主張と出典の照合を自動では保証しない。
- 既存のoutputs/は変更・整理していない。commit/push、契約、有料API、投稿は行っていない。

## TODO・再開方法
- 次はT104（題材選定・本人の考察・台本承認の工程）。`./scripts/run src/cli.ts check` の後にstartする。
- T106で、今回気づいた文字位置のずれ（flowの番号と強調枠の重なり、架空の例の札、compareの上寄り）を再現・修正し、sample-render-verificationを試用する。
- 新テーマのサンプル再生成: `./scripts/run src/cli.ts sample --plan fixtures/sample-general.json`（outputsに新しいジョブができる）。
