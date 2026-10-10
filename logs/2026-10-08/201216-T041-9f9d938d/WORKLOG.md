# 作業記録 T041
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-08T20:12:16Z / UTC（session.jsonが正）
- 記録種別: 同時記録

## 依頼・許可範囲
エンハンス一括実施のうちT041（台本形式v2と--plan入力指定、候補1・9）。ローカル作業のみ

## 実施内容・変更ファイル
- src/plan.ts（新規）
  - Plan v2の型: schema 2、scenes[].{title, narration, cues[{text, seconds}], diagram, sources[], seconds}、sources[{id, title, url, accessedAt}]。
  - 図解は4種: flow{items}、compare{left, right, leftItems, rightItems}、number{value, label, note?}、branch{question, yes, no}。
  - 上限はLIMITSにまとめた。場面200、総尺1500秒、場面2〜120秒、cue 55字、ナレーションは秒数×9字まで。
  - 関数: validatePlanV2、toV2（v1→v2）、loadPlan（v1/v2両対応）、totalSeconds。
  - v1の型（PlanV1）と検証（validateV1）をproviders.tsから移した（循環importを避けるため）。
- src/providers.ts
  - Planはv2を指すようにした。validatePlanはvalidateV1の再exportとし、既存の呼び出しとの互換を保った。
  - FixtureScriptが任意のパスを受け取れるようにした（既定はfixtures/sample.json）。
- src/commands/sample.ts
  - parseSampleArgs（--plan）、vttStamp（ミリ秒）、buildVtt（cueごと）を追加した。
  - job.jsonにinput、durationSeconds、versions.planSchemaを追加した。
- src/commands/serve.ts: ジョブIDの正規表現を`^[-a-z0-9]+-[a-f0-9]{8}$`へ一般化した。
- src/media.ts: 型を場面の秒数だけに依存する構造型（Timeline）へ変更した。
- scripts/render.swift: v2をデコードするようにした。T041時点では、字幕にcues[0]を、図解にflowのitems（2〜4個）を描画する。
- src/cli.ts: sampleへ引数を渡すようにし、使い方を更新した。
- fixtures/sample-v2.json（新規、48秒・6場面・4種の図解・複数のcue）。
- tests/plan.test.ts（新規、10件）、tests/pipeline.test.ts（v2の検証へ更新）、tests/media.test.ts（loadPlanへ更新）。
- tickets/T041.md（done）、docs/STATUS.md（エンハンスの進捗欄を追加。T014の作業回でSTATUSの更新が漏れた事実も記録した）。

## 判断と理由
- 内部処理はすべてv2に統一し、v1は読み込み時に変換する。描画・字幕・音声の処理を1つの形式で書けるようにするため。
- 変換の影響: job.jsonのinputHashは、変換後のv2のJSONから計算するため、以前のv1ジョブとは値が変わる。ハッシュは同じジョブ内の照合に使うもので、ジョブをまたいだ比較には使われていない。
- cueの上限はv1のsubtitle上限（55字）に合わせた。字幕枠（幅1140、29pt）では2行に収まる。
- ナレーションの上限（毎秒9字）は、日本語の読み上げとしては速めの上限で、明らかな詰め込みだけを弾く値にした。読み上げ速度の実測はT028で行う。
- 出典はhttpsと確認日を必須にした（調査の方針、docs/RESEARCH-AI.mdに合わせた）。
- Skill化の評価: 新しい定型手順は生じていない。見送る。

## 検証コマンド・結果・証跡
証跡はevidence/verification.txtに保存した。
- `./scripts/run --test tests/*.test.ts` → 46件成功・失敗0。
- `tsc --noEmit` → エラー0。
- `cli.ts sample`（v1） → reflection-demo-95ee9921。場面画像6枚がすべて7f46324eとcmpで一致し、VTTはミリ秒の形式になった。
- `cli.ts sample --plan fixtures/sample-v2.json` → bias-check-demo-3591727d。completed、48秒、planSchema=2。VTTにcueごと12件が出力された。
- `cli.ts sample --bogus` → 「不明な引数」で失敗した（意図どおり）。

## 未実施・制約
- v2サンプルの非flow図解（branch、compare、number）は、T041時点では描画されない。T043で対応する。
- v2の画面目視はT043の後に行う。
- 字幕の焼き込みはcues[0]だけで、cueごとの切替はT043/T044で行う。

## TODO・再開方法
- 次はT042（安全検査）。対象はsrc/plan.tsのPlan。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T042`。
