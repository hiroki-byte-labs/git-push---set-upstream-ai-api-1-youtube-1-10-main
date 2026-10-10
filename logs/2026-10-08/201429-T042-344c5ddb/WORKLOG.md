# 作業記録 T042
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
エンハンス一括実施のうちT042（台本の安全検査、候補2）。ローカル作業のみ

## 実施内容・変更ファイル
- src/lint.ts（新規）
  - lintPlan(plan)はLintResult{ok, errors, warnings, findings[]}を返す。formatLintは表示用。
  - FORBIDDENは規則名・正規表現・説明の表で、規則はguarantee（2本）、recommendation、specific-security、hypeの4種。
  - NUMERIC_CLAIMは、%、倍、円、ドル、年率、利回りなどの数値表現を拾い、場面のsourcesが空ならerrorにする。
  - disclaimer: 最終場面のナレーションと字幕に「推奨」「保証」の両方がなければerrorにする。
  - unused-source: どの場面からも参照されない出典をwarningにする。
- src/commands/sample.ts: plan.jsonを書いた直後に検査する。lint.jsonを出力し、job.jsonにlintの要約とlint-checkedイベントを記録する。errorがあれば例外でfailedにする。
- src/cli.ts: lintコマンド（--plan対応、errorなら終了コード1）を追加し、使い方を更新した。
- tests/lint.test.ts（新規、12件）: 同梱台本の合格、禁止表現6例、字幕・図解の検査、数値と出典、免責、免責文の誤検出なし、未使用の出典。
- tickets/T042.md（done）、docs/STATUS.md。

## 判断と理由
- 検査はsampleの最初（音声・描画の前）に置いた。違反台本に描画やAPI費用（M2以降）を使わないため。
- 免責文「個別銘柄の推奨や利益の保証はしません」が禁止表現に誤って当たらないよう、recommendationの正規表現は「推奨銘柄」「推奨の銘柄」の語順に限定した。試験で誤検出がないことを確認した。
- 数値表現は出典があれば許可する。出典の内容が正しいかは自動では判定しない（人の確認の対象）。
- 正規表現は見逃しを減らす方向で作った。誤検出が出たら、台本側を言い換えるか規則を調整する（チケットで管理する）。
- Skill化の評価: 新しい定型手順はない。見送る。

## 検証コマンド・結果・証跡
証跡はevidence/verification.txtに保存した。
- `cli.ts lint`（v1の既定）と`lint --plan fixtures/sample-v2.json` → どちらもerror 0、終了コード0。
- 違反の台本（scratchpadのlint-ng.json。v2サンプルに「今すぐ買うべきです。必ず儲かります。」と「年率5%の運用例です。」を注入、id=lint-ng-demo）でlint → error 3（guarantee、recommendation、unsourced-number）、終了コード1。
- 同じ台本でsample → job.jsonがstatus=failed、lint={ok:false, errors:3}、eventsが['lint-checked']だけになり、audio.wavとsample.mp4は作られなかった。
  - 証跡の`exit=0`は`| tail`の終了コードで、CLI自体の終了コードではない。
- `--test` → 58件成功。`tsc --noEmit` → エラー0。

## 未実施・制約
- 意味の理解（皮肉、否定文の文脈）や法令適合の判定はしない。
- 数値表現の検出は正規表現の範囲（漢数字の「五割」などは未対応）。
- 失敗した検証用ジョブoutputs/lint-ng-demo-*は残っている（T033のジョブ管理で退避対象になる）。

## TODO・再開方法
- 次はT043（描画）。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T043`。
