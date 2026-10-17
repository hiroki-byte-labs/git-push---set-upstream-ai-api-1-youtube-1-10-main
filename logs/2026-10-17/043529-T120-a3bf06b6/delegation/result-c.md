# Remotion描画経路 再監査（T126, T152〜T156）

実害のある乖離は見つかりませんでした。軽微が3件です。

実行して確認した内容は次のとおりです。
- `tests/remotion-layout`、`remotion-media`、`readability-gate`の23件が合格しました。
- `motion-lab/tests/*.test.ts`の33件が合格しました。
- `checkReadability`への入力を一時ディレクトリで再現しました。

実Remotionでの動画生成はしていません。チケットに書かれた実デコード目視の証跡は、ログの読取りだけで再実行していません。

## T126: 軽微

**(a) 主張:** 選択したrendererと版がjob記録に残る。

**(b) 実際:**
- `src/commands/sample.ts:171`で、`versions.rendererSource`は`motion-lab/src/PlanVideo.tsx`だけのsha256です。
- 描画内容の実体は`StandardDiagram.tsx`、`primitives/BurnInSubtitle.tsx`、`layout-probe.tsx`、`remotion-plan.ts`、`diagram-timing.ts`、`shared/illustration.ts`にあります。
- `rendererKind`は`local.remotion`として記録されます。

**(c) 影響:** 上記の他ファイルだけを変えても版が変わりません。「どの描画コードで作ったか」を後から区別できません。

**(d) 根拠:** `sample.ts:171`と`import`先の比較です。

**(e) 確度:** 確認済み（コード上）。

なお、sample→lint→音声→描画→サムネイル→可読性→文字配置→`completed`の順で、各検査の失敗は`throw`されて`failed`になります。`--renderer`を`--queue`に渡す経路も`queue-adapter.ts:46-47`で保持されています。

## T152: 問題なし
- `StandardDiagram.tsx`は、compareの左右ラベルと全項目、numberのvalue/label/note、meterの符号・0幅・total（算術平均）を描きます。
- `PlanVideo.tsx`の`renderDiagram`は、illustration、compare/number/meter、flow、branchの順で振り分けます。supported diagramは人型fallbackに落ちません。
- `standard-diagram.test.ts`は`renderToStaticMarkup`で本番のJSXを描画し、fill位置・幅を数値で照合しています。
- illustration付きの場面は、nativeも図解データを描かないため、同じ挙動です（`scripts/render.swift:385`）。

## T153: 問題なし
- `SceneInformation`は、fictional・reflection・action・出典の各表示を、`production.mode`が欠けた場合も含めて仮の考察表示にします。
- 出典番号は`toRemotionPlanProps`が初出順で採番し、`sourceRecords`と`sourcesText`との一致をテストが照合しています。

## T154: 問題なし
- cueの終端は、最後のcueだけ場面終端に揃え、それ以外は累積丸めです。
- `plan.ts:233`が、cue秒の合計と場面秒の一致を検証しています。
- `soft`では焼き込みを描画せず、`both`と`burn`では描画します。
- `diagramStepProgress`は`transitions=false`と`reveal`を全図解型に適用します。
- `BurnInSubtitle`の`fade`は`Math.floor(durationInFrames/6)`で、完全表示区間が残ります。

## T155: 軽微（2件）

### 1. 可読性検査が欠測を合格にする
- **(a) 主張:** 測定の欠測では合格しない。
- **(b) 実際:** `src/readability.ts:19-30`。
  - `render-report.json`が`[]`の場合は`ok:true`（`minFont720:0`）になります。
  - 全件が`readabilitySample:false`の場合も`ok:true`になります。
  - `pixelSize`と`contrast`が欠けた記録も、`NaN < 16`と`undefined < 4.5`が偽になるため`ok:true`（`minFont720:null`）になります。
- **(c) 影響:** 現状のRemotion経路では、`validateCoverage`が記録の存在を保証し、`contrast`は有限値でなければ例外にします。そのため実害は出にくいです。ただし、native経路や将来の描画経路では、測定欠測が可読性合格になります。
- **(d) 再現:** 一時ディレクトリに上記3種のJSONを置き、`checkReadability(dir,1)`を呼ぶと、いずれも`{"ok":true,...,"issues":[]}`が返ります。
- **(e) 確度:** 確認済み（再現）。

### 2. 測定の網羅が一部の表示に及んでいない
- **(a) 主張:** 全cue・全場面の描画寸法を測る。
- **(b) 実際:** `src/remotion-layout.ts`の`validateCoverage`。
  - 必須にしているのは、見出し、cue中点の字幕、出典`[n]`、場面末尾の図解本文だけです。
  - 札（架空・考察・チェックリスト）の存在は要求していません。
  - illustrationの場面は`diagramTexts`が`[]`を返し、SVGラベルを要求していません。
- **(c) 影響:** 札が欠けても、illustrationのラベルが欠けても、測定は合格します。ただし札は`SceneInformation`が同じpropsから決定的に描き、その表示はテストが確認しています。そのため、描画が壊れた場合のみ見逃します。
- **(d) 根拠:** `remotion-layout.ts`の`diagramTexts`（illustration時は`[]`）と、`validateCoverage`の`badge`ゾーンへの言及がないことです。
- **(e) 確度:** 確認済み（コード上）。

固定値・架空値の混入はありません。`render-report.json`の値はすべてDOMのRange測定と、文字を隠した背景PNGの画素から計算されています。`tests/remotion-layout.test.ts`が、固定値の混入を実際には防いでいる確認として、ソースの文字列`contrast: 18.5`を`doesNotMatch`でも見ています。

## T156: 問題なし
- 期待フレーム数は`round(duration×fps)`で、実デコードの`-progress`最終`frame=`と厳密に一致を求めます。
- 映像・音声・コンテナの尺は±0.1秒で、`NaN`は`isFinite`で不合格です。
- stream検査は、映像1・音声1、h264/aac、解像度、fps、字幕streamの数と種別です。
- 全デコードは`-xerror -err_detect explode`で、stderrがあれば不合格です。
- PCMは無音とclippingを不合格にします。
- ffprobeの起動失敗は例外で、`media-check.json`に`failed`と`error`が残ります。
- テスト12シナリオ（truncated、no-audio、frame-count、inspector/decoder failureなど）は、本体を迂回せず実ffmpegで実行されています。
- 未測定項目（LUFS・字幕表示内容など）は`unmeasured`に明記されています。

**補足（軽微、確度は仮説）:** ルートの`package.json`の`test`は`tests/*.test.ts`のみです。T152〜T154の主要テスト（`motion-lab/tests/standard-diagram`、`scene-information`、`subtitle-timing`）は、`motion-lab`側のテスト実行でしか動きません。ルートのテストだけを回す運用なら、これらは検査されません。

## 要約
1. Remotion経路は、図解の全項目・数値・出典・架空表示・字幕モードがnativeと同じ情報量で描かれ、媒体検査は実デコードで欠測時に不合格になります。実害のある乖離は見つかりませんでした。
2. 軽微は、`checkReadability`が空や欠測の記録を合格にすること、`rendererSource`が`PlanVideo.tsx`のみのhashであること、文字配置の網羅に札とillustrationラベルが含まれないことです。
3. 前回のような「不合格の無視」「別ジョブの設定での描画」「検査結果の画像との未結合」に当たる経路は、この担当範囲では確認できませんでした。