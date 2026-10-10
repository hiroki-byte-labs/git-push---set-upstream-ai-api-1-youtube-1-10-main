# 作業記録 T095
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-10T06:04:18.002Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T095: docs/CLAUDE-REPAIR-INSTRUCTIONS.mdに従い、承認をタイトル・概要・字幕・サムネイル・動画の確認対象一式の版に結び付け、隔離回帰試験と記録を完了する。YouTube接続・既存outputsの書換え・push・投稿は行わない

## 実施内容・変更ファイル
- 開始前: T094の作業回を閉じた後、`check` OK（33 sessions）。読んだもの: tickets/T095、src/review.ts、src/metadata.ts（reviseTitle）、src/commands/serve.ts、src/cli.tsのreview、src/commands/sample.tsの出力ファイル、tests/review.test.ts、tests/metadata.test.ts、T093 REVIEW.md指摘2。
- tests/approval.test.ts（新規）: 先に15件を追加し、未修正の実装で13件失敗を確認した（動画変更と対象外変更の2件だけ成功）。
- src/review.ts: 確認対象一式reviewBundleと版bundleHashを追加。approvalOf/recordReviewを一式の版で判定・記録するよう変更。旧形式の承認の扱いを追加。
- src/commands/serve.ts: 一式から承認対象を表示し、一式の内訳と版を表示。フォーム名をbundleHashに変更。履歴に旧形式/一式の版と記録者を表示。
- src/cli.ts: reviewの表示に一式の内訳を追加、記録の出力を一式の版に変更。
- tests/review.test.ts: POSTのフォーム名をoutputHash→bundleHashへ変更（2か所）。
- docs/OPERATIONS.md、docs/SPEC.md、docs/HANDOFF.md、docs/DECISIONS.md（ADR-015）、tickets/T095.md（done）、docs/STATUS.md。

## 判断と理由
- 一式の範囲: 投稿時にYouTubeへ出る予定のもの（動画、採用タイトル、概要欄、タグ、チャプター、字幕、サムネイル）。候補タイトルやissuesは画面に出るが投稿されないため対象外にした。台本plan.jsonは動画に焼き込まれた後の参照用で、動画のハッシュで中身が固定されるため対象外。
- サムネイル: 採用案を選ぶ機能がないため、全案を対象にした（指示書の保守的な方式）。job.thumbnailsの記録と実在ファイルの和を取り、記録にあるのに無い画像はnullとして版を変える。
- 版の計算: 時刻やreview.json自身を含めず、キー順を固定したJSONのSHA-256にした。再計算で版が変わらないことを試験した。承認時と判定時に同じ関数を使う。
- 画面の表示版: 版の計算に使った一式（approval.bundle）から採用タイトル・概要欄・タグ・サムネイルを表示し、同じ版をフォームで送る。読み込みの間に変わった場合もPOST時の再計算で拒否される。
- 旧形式: bundleHashのない承認は、タイトル等を確認した証拠がないため一式へ広げずexpired（理由で旧形式と明示）。新しい状態名を増やさず、既存の「承認失効」の表示と処理を流用した。過去のreview.jsonは書き換えない。
- 動画がjob.outputHashと異なる場合のexpiredは従来どおり残した。
- 試験の承認は記録者test-agentで行い、人の承認と区別した。

## 検証コマンド・結果・証跡
- `./scripts/run --test tests/approval.test.ts`（修正前）: tests 15 / pass 2 / fail 13、終了コード1。evidence/before-fix.txt。
- `./scripts/run --test tests/approval.test.ts tests/review.test.ts tests/metadata.test.ts tests/jobs.test.ts`（修正後）: tests 36 / pass 36 / fail 0、終了コード0。evidence/after-fix.txt。
- `./scripts/run node_modules/typescript/bin/tsc --noEmit`: 出力なし、終了コード0。evidence/typecheck.txt。
- 既存ジョブの読み取り確認: `cli.ts review bias-check-demo-9233f7b6`（承認・差戻しの引数なし＝表示のみ）→ expired（旧形式）。review.jsonのSHA-1が前後で同一。evidence/legacy-readonly.txt。
- finish後に `cli.ts check` と `next` を実行する。

## 未実施・制約
- 採用サムネイルの選択機能は未実装（全案を対象にする暫定方式）。
- ブラウザーでの目視確認はしていない。画面はHTTPの試験（表示版の抽出、POSTの303/409）で確認した。
- 既存ジョブの承認記録は旧形式のためexpiredになる。人が改めて確認する必要がある（エージェントの動作確認記録であり、元々人の承認ではない）。
- YouTube接続・投稿は未実装のまま。
- Skill化の評価: 今回も「再現試験→修正→文書→記録」の流れで、指示書と既存Skill repository-task-closeoutで足りる。T094〜T099全体の反復の評価はT099でまとめて行う。今回は見送る。

## TODO・再開方法
- 次はT096（サムネイル代替文言の禁止表現検査）を新しい作業回でstartする。
- 採用サムネイル選択を作る場合は、一式へ選択結果を入れ未採用案を外す別チケットを作る。
- 再開: NODE_BINを指定 → `./scripts/run src/cli.ts check` → `next`。
