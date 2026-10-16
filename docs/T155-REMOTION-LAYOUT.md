# Remotion文字配置の測定（T155）

実装は追加済み。Chrome起動制約のため、実ブラウザーDOM・実Remotion映像の受入検証は未完了。

## 座標と描画

SceneTemplateは1920×1080の共通座標を使い、全要素を `outputWidth / 1920` で一度だけ縮尺する。720pは2/3、1080pは1。見出し、札、図解、字幕、出典の専用区画を持つ。flowは可変幅の4列内で折り返し、branchとnumber/compareも欄内で折り返す。字幕の背景枠なし・白文字・影は維持する。収まらない文字を省略して合格にしない。

## 測定経路

`src/remotion-visual.ts` が `motion-lab/tools/render-plan.mjs` を起動する。既存の固定版Remotionのrenderer/bundlerをCLI依存から解決し、同じbundle/propsで無音MP4と測定用PNGを生成する。外部AIやAPIは呼び出さない。

- 全cue中央のフレームと全scene末尾のフレームを選ぶ。cue中央はT154の完全表示区間。末尾は最後のdiagram revealの網羅用。
- `layout-probe.tsx` は各フレームでfonts.readyを待ち、区画内の全テキストノードをTreeWalkerで列挙し、DOM Rangeの実矩形・行矩形、親/区画の実矩形、computed font/color/opacityを記録する。ブラウザープレビューのscaleを除き、出力画素に変換。SVGはfillとscreen CTMも使う。
- `layout-dom.json` にscene/frame付きの生の測定結果を保存する。全cue、見出し、全source番号と通常5図解の全ラベル（重複数を含む）の末尾網羅を照合し、欠落は例外にする。illustrationの文字は実SVGを列挙するが、通常diagramのラベルへ読み替えない。
- 同一フレームを文字だけ非表示にしてPNG化し、各文字の行矩形内の全背景画素とcomputed foreground/opacityから最小コントラストを計算する。字体のアンチエイリアス画素や影を前景色とはみなさない。renderStillのresolved propsにも非表示指定を反映する。
- `render-report.json` は720p換算・左下原点へ変換したbox/drawn/zoneBounds/parentBox/linesと、実画素のpixelBounds/pixelSize、実コントラスト、測定法、frame/sceneを含む。見出しのsizeも実CSSから算出し、固定の合格値を置かない。
- 末尾サンプルの字幕も配置検査へ渡す。退場フェードの瞬間値はそのままcontrastへ記録するが `readabilitySample: false` とし、可読性の判定は全cue中央の完全表示サンプルを使う。他の文字は末尾も可読性検査する。
- 画面外、区画/親からのはみ出し、同区画を含む文字同士の重なり、字幕3行以上を不合格にする。Remotionレコードだけを拡張し、nativeの座標・描画は保持する。
- 各測定フレームを完成MP4から再デコードし `frame-N.png` を作る。`layout-N.png` はレンダラーのPNG。実生成が可能な環境で両方とレポートを照合する。サムネイルも実際の動画フレームから取り、同じ見出しの測定結果を使う。

## Fixtureと再開

`fixtures/remotion-layout-stress.json` は5図解・20秒・10cue。全title30字、chapter24字、全cue55字（後半含む）、通常図解の文字上限/項目数上限、120字のsource titleを20件含む。source titleは画面には連結せず番号のみを表示する。source参照数にはPlanの上限がないため「最大件数」は定義できない。`remotion-layout-overflow.json` は200参照を一行の出典欄へ送り、意図的にはみ出しを検出するための別fixture。

隔離コピーで次を実行する（既存outputsは変更しない）。

```sh
./scripts/run src/cli.ts sample --plan fixtures/remotion-layout-stress.json --renderer remotion --resolution 720
./scripts/run src/cli.ts sample --plan fixtures/remotion-layout-stress.json --renderer remotion --resolution 1080
./scripts/run src/cli.ts sample --plan fixtures/remotion-layout-overflow.json --renderer remotion --resolution 720
```

通常fixtureのlayout/readability・全scene/全cue・実フレームを確認し、負fixtureはlayout不合格を確認する。独立ffprobe/count_frames、全映像/音声デコード、代表フレーム目視、ブラウザーまたはAVPlayer再生はsample-render-verificationに従う。合成DOM入力の単体試験は実DOM成功の証拠にしない。Chromeが起動できない場合は未完了のまま記録する。
