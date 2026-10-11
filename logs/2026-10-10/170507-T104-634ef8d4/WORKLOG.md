# 作業記録 T104
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-10T17:05:07.234Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
docs/CLAUDE-IMPLEMENTATION-BATCH.mdに基づく一括実装依頼のうちT104（題材候補→本人選択→本人考察入力→台本承認→制作→動画承認の工程を制作ジョブとして実装し、未入力・差戻し・変更失効・デモと本番の区別をCLI/HTTPで検証）を行う。本人の選択・考察・承認は代行せず、試験はtest-agentの記録とデモで行う。契約・有料API・投稿・commit/pushはしない。
利用者の依頼（チャット）: T103/T104/T106/T108を順に実装・検証・記録。本人の題材選定・考察・台本承認・動画承認は代行しない。検証用データは検証用と明示する。

## 実施内容・変更ファイル
小単位104-1〜104-6を実施。
- 104-1 設計: docs/DECISIONS.md ADR-018（保存先、台本の版の構成、考察の差し込み、整形版の区別、制作の開始条件、動画承認への接続、デモと本番、限界）。
- 104-2 選択・考察: src/production.ts（新規。createProject、selectTopic、addReflection、validateCandidates、isAgentName、authorshipLabel、modeOf）。
- 104-3 台本: injectReflection・splitCues・attachScript・reviewScript・projectState・scriptHashOf（src/production.ts）。src/plan.ts（ROLESにreflection、REFLECTION_PLACEHOLDER、production欄の検証）、src/lint.ts（reflection-missing）。
- 104-4 制作経路: assertRenderable・linkRender、src/commands/produce.ts（新規、render含む）、src/commands/sample.ts（job.mode・project・scriptHash・scriptVersion、デモ表示、戻り値）、src/review.ts（一式に台本の版、scriptMismatch、approvalOf/recordReviewでの失効と拒否、publishReadiness、workflowStatus、本番の動画承認のエージェント名拒否）。
- 104-5 デモと本番: sampleは常にmode=demo、--demo案件、modeのない既存ジョブはデモ（ファイル無変更）。src/jobs.ts（mode、kind、project）、src/cli.ts（produce、jobs/reviewの区分・公開前の判定表示）。
- 104-6 CLI/画面: src/commands/serve.ts（制作案件ページ、select/reflection/script-reviewのPOST、Host/Origin検査の流用、本文上限64KiB、確認者名の入力、区分と公開前の判定）。README.md（本人の工程を通す制作の操作例）、docs/SPEC.md、docs/OPERATIONS.md、docs/CHANNEL-POLICY.md、docs/STATUS.md、tickets/T104.md。
- fixtures/topic-candidates-demo.json、fixtures/draft-general-demo.json（開発用と明記）。tests/production.test.ts（17件）。
- Skill: .agents/skills/sample-render-verification/SKILL.md を更新（Swiftキャッシュをコピーしない理由、デモ案件の流れ）。

## 判断と理由
- 再制作で動画を上書きしないよう、制作案件と制作ジョブを分けた（ADR-014の非上書き方針と、承認履歴が古い動画と混ざる問題を避けるため）。案件の工程はjob.jsonの履歴から毎回導出し、状態の二重管理をしない。
- 台本の版に選択した候補の内容・考察の版とハッシュ・台本ファイルのハッシュを入れ、events等の運用記録は含めない（「運用ログ更新だけでは失効しない」要件）。同じ候補を選び直しただけなら版は変わらない（入力が同一のため）。
- 考察は本文を変えずに差し込み、字幕は文単位で55字以内、尺は6字/秒（落ち着いたゆっくりした声の希望に合わせた暫定値）。考察に禁止表現や出典なし数値があれば台本を確認に回さない（本人に直してもらう、または下書きに出典を足す）。
- 本番の案件でのエージェント名の拒否は自己申告名への安全網で、認証ではないとADRに明記。整形版（assisted）はエージェントが記録してよいが、本人執筆の版を元に必須とし表示で区別する。デモ案件では考察を「デモ用の仮文（本人の考察ではない）」と表示する（実制作の確認中に「本人執筆」と出る誤解を見つけて修正）。
- 画面からの入力も用意した: 長い台本や考察をターミナルだけで扱うのは本人に負担が大きいため。投稿・認証は追加していない。
- produce renderに--planを許さない（承認済み台本以外で本番の動画を作らせない）。強制オプションは設けない。
- routine-to-skill評価: T103で作ったsample-render-verificationを今回の隔離実制作に適用（試用）し、実際に失敗したSwiftキャッシュのコピーと、制作案件のデモ手順を追記して更新した。新規Skillは作らない（反復の根拠が今回の1回だけのものは見送り）。同じ作業回での再評価はしない。

## 検証コマンド・結果・証跡
- 対象試験: `./scripts/run --test tests/production.test.ts tests/approval.test.ts tests/review.test.ts tests/jobs.test.ts tests/lint.test.ts tests/plan.test.ts` → tests 93 / pass 93 / fail 0、EXIT=0（evidence/target-tests.txt）。
- 全体: `./scripts/run --test tests/*.test.ts` → tests 182 / pass 182 / fail 0、EXIT=0（evidence/all-tests.txt）。型検査 `tsc --noEmit` EXIT=0（evidence/typecheck.txt）。
- 新機能のため修正前の失敗はない。代わりに変異試験: 隔離コピーで安全装置を1つずつ外し、tests/production.test.tsが失敗することを確認（制作の拒否を外す→4件失敗、動画と台本の照合を外す→1件、エージェント名の拒否を外す→2件、考察版の照合を外す→1件）。evidence/mutation-check.txt。
- 隔離コピーで実制作込みのCLIの流れ（evidence/cli-flow-isolated.txt）: new→render拒否（不足3件）→select→render拒否→reflection→script→render拒否（台本未承認）→script-review→render（初回はSwiftキャッシュのコピーで失敗、除いて再実行し生成完了・83秒）→review（デモ、公開前の判定不可）→test-agentで承認→考察v2→render拒否→review（失効）→script v2→承認→review（失効、制作時v1・現在v2）→承認を試みて拒否（EXIT=1）→jobs（区分・工程の表示）。
- 実ブラウザー（evidence/browser-check.md）: 案件ページ表示、考察フォーム送信で工程が台本の作成待ちへ、台本表に入力した考察がそのまま反映、画面を開いたまま考察を更新して古い画面から承認→409、動画ページのデモ表示・承認失効・公開前の判定不可。
- 既存ジョブ（リポジトリのoutputsを読み取りのみ）: jobsで旧ジョブがデモ表示、review bias-check-demo-9233f7b6で旧形式の承認は失効・公開前の判定不可（evidence/legacy-jobs.txt）。

## 未実施・制約
- 本人の実際の題材選択・考察・台本承認・動画承認は行っていない（代行しない）。試験とデモはtest-agentと一時ディレクトリの架空の人名だけで記録した。
- 記録者名は自己申告で、なりすましを技術的には防げない。job.jsonの手編集はハッシュとの照合で検出できる範囲に限る。
- 本番用の題材候補リスト（実在のニュースに基づくもの）はまだ作っていない。時事の候補は公式一次資料の確認が必要なため、案件ごとにエージェントが用意する。
- 制作案件の動画の描画に「本人の考察」「デモ」の札を出す変更はT106で行う。
- outputs/（リポジトリ）は読み取りのみで変更していない。commit/push・投稿・課金はしていない。

## TODO・再開方法
- 次はT106（構成・動き・字幕・サムネイル）。統合試作はデモ案件の流れ（README・SKILLの手順）で隔離生成する。
- 本人が本番の制作を始めるときは、エージェントが題材候補（候補.json）と下書き台本を用意し、本人が `produce select` → `produce reflection` → 台本の確認・承認 → 動画の確認を行う（READMEの手順）。
- 再開時は `./scripts/run src/cli.ts check` の後、`produce status <id>` で各案件の不足を確認する。
