# 作業記録 T072
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
13件の実施依頼のうちT072（出典・立場・利害関係の画面表示と概要欄用テキスト）。ローカル作業のみ

## 実施内容・変更ファイル
- config/channel.json（新規）
  - 欄: decided=false、channelName、stance、conflictsOfInterest、disclaimer。
  - 立場と利害関係は「未設定（例: …）」にした。免責は既存のlint規則に合う文にした。
- src/channel.ts（新規）
  - loadChannel: 必須項目と型を検証する。
  - sourcesText: 出典がなければ「なし」と明示する。場面での初出順に番号を振り、未参照の出典は末尾に置く。題名、確認日、URLを出す。
  - stanceText: 立場、利害関係、免責を出す。未確定なら公開禁止の注記を付ける。
- src/commands/sample.ts: lintの後でsources.txtとstance.txtを出力し、job.channelDecidedを記録する。未確定ならchannel-undecidedのイベントを記録する。
- scripts/render.swift
  - Plan.sources（id、title）とScene.sourcesをデコードする。
  - 出典のある場面だけ、フッター中央（x=470、幅620、17pt）に「出典: 題名 / 題名」を描く。
  - 収まらなければ「出典: 概要欄 [n]」にする。補助関数としてfits()とsourceNumber()を追加した（番号の規則はsourcesTextと同じ）。
- tests/channel.test.ts（新規、3件）。
- tickets/T072.md（done）、docs/STATUS.md。

## 判断と理由
- 立場・利害関係の実際の文言は利用者が決める（T070）。そのためdecided=falseとし、未確定であることを出力とjob.jsonに明示した。根拠のない文言を作らない。
- 出典の題名は最大120字で、フッターに収まらないことがある。そのまま不合格にすると正当な台本が止まるため、概要欄の番号表示に切り替えた。番号の規則は概要欄の一覧と同じにした。
- 同梱のサンプルには実在の出典を加えなかった。数値や事実の主張を伴わない出典は不自然で、根拠のない主張を作らないため。検証はscratchpadの台本（example.orgの架空出典2件。evidence/sourced-plan.jsonに写しを置いた）で行った。
- フッターの証跡画像は、最初の切り出し位置（y=660）が誤っていて何も写らなかった。y=605で切り出し直した。表示そのものの不具合ではない。
- Skill化の評価: 見送る（新しい定型手順なし）。

## 検証コマンド・結果・証跡
証跡はevidence/に保存した。
- `--test` → 91件成功。`tsc --noEmit` → エラー0。
- `sample --plan scratchpad/sourced.json` → sourced-demo-fce4232d。completed、channelDecided=false、eventsにchannel-undecidedがある。
  - sources.txtは2件で、場面の初出順。stance.txtに未確定の注記がある。
- 目視（source-footer.png）
  - 場面4は「出典: 検証用の資料A（架空）」。
  - 場面5は長い題名のため「出典: 概要欄 [2][1]」。一覧の番号と一致した。
- v2（出典なし）のsources.txtは「出典: なし…」。
- v1はreflection-demo-816de2ce。scene-1〜6がM1と一致した。

## 未実施・制約
- 立場・利害関係の文言は未確定（T070）。
- 出典の内容が正しいかは検証しない（人の確認の対象）。

## TODO・再開方法
- 次はT074（タイトル、概要欄、チャプター）。sources.txtとstance.txtをdescriptionに統合する。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T074`。
