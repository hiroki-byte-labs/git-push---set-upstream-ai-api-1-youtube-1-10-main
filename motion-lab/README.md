# motion-lab: 参考動画の動きの解析とRemotionでの再現（最小検証環境、T110）

参考動画のアニメーションをFFmpegで解析してJSONに保存し、Remotion + React + TypeScriptで**自作の図形**により演出を再現・レンダリングし、参考動画とフレーム比較して差異を直すための最小環境です。本体の制作パイプライン（リポジトリの `src/`）とは独立したサブプロジェクトで、Remotionなどのnpm依存はこの中だけにあります。

まずは10秒の動画を対象にしています。許可済みの外部素材がまだないため、検証用の参考動画は `tools/make-reference.ts` が数式から作る**自作の合成動画**（正解値つき）です。

## 準備
- Node.js 24以上、pnpm（Node付属のcorepackや任意の方法で導入。npmでも可だが、固定の正本は `pnpm-lock.yaml`）
- FFmpeg（libx264、ssim/psnr/scdet/drawtextフィルター）。探索順は `FFMPEG_BIN` → リポジトリの `work/`（`../scripts/setup-media` で取得）→ PATH
- 初回のレンダリングで、Remotionが公式の **Chrome for Testing**（約186MB）を `node_modules/.remotion/` に取得します（理由は「既知の問題」）

```sh
cd motion-lab
pnpm install --frozen-lockfile
```

## 実行
```sh
# 全工程（参考動画の作成→解析→JSON保存→Remotionでレンダリング→比較→正解照合）
node tools/lab.ts --run demo --theme both

# 手元にある、利用を許可された動画で検証する（取得・ダウンロード機能はない）
node tools/lab.ts --run mine --reference /path/to/clip.mp4 --rights '本人撮影（2026-10-10）'

# 個別の実行
node tools/make-reference.ts --out out/ref
node tools/analyze.ts out/ref/reference.mp4 --out out/ana --rights '自作の合成動画'
pnpm exec remotion render src/index.ts Reproduction out/rep.mp4 --props=<{"analysis":…,"theme":"measured"} のJSONファイル>
node tools/compare.ts out/ref/reference.mp4 out/rep.mp4 --reference-analysis out/ana/analysis.json --out out/cmp
node tools/score.ts out/ref/ground-truth.json out/ana/analysis.json

# プレビュー（labが public/latest-analysis.json に最新の解析を複製する）
pnpm exec remotion studio

# 試験と検査
node --test tests/*.test.ts
pnpm run typecheck
pnpm exec eslint src
```

`--theme both` は、解析した色・形で描く再現（measured、フレーム比較用）に加えて、同じ動きを独自の配色・角丸で描く再現（house）も作ります。

## 出力（`out/<run>/`、Git対象外）
| パス | 内容 |
|---|---|
| `reference/` | 参考動画と正解値（合成動画のときだけ） |
| `analysis/analysis.json` | 解析結果（下記） |
| `analysis/frames/seg-XX/` | 動きの区間ごとの連続フレーム（PNG）と番号つき一覧画像 `contact.png` |
| `render/` | Remotionの描画結果と、渡したprops |
| `compare/` | `compare.md`（報告）、`compare.json`、SSIM/PSNRのフレーム別ログ、比較画像（参考｜生成｜差×4）、`side-by-side.mp4`、生成動画の解析 |
| `compare-house/` | 独自配色版の比較（動きだけで判定） |
| `score.md` / `score.json` | 正解値との照合 |
| `summary.json` | 判定の要約 |

## 解析の流れと解析JSON（`motion-lab/analysis@1`、型は `shared/analysis.ts`）
1. **シーン切替**: 縮小フレームの差分（変化した画素の割合・平均差）とFFmpegの `scdet` を突き合わせる（`scenes[].cut.method`）。
2. **動きの区間**: 変化画素の割合がしきい値を超えるフレームの連なり（`motionSegments`）。
3. **連続フレームの抽出**: 区間ごとにPNGと一覧画像を書き出す。
4. **図形の推定**: シーンごとに単色背景を推定し、前景の連結成分をサブピクセルで計測（被覆率で重み付けした面積・重心・2次モーメント・外接矩形・角の深さ）。フレーム間で追跡し、図形ごとに
   - 動作開始・終了時刻（小数フレーム）、位置・大きさ・角度・不透明度の変化
   - 種類（translate / scale / grow / resize / rotate / fade-in / fade-out）、方向・速度、固定された縁
   - イージング（`shared/easing.ts` の14候補をRemotionのEasingと同じ数式で当てはめ、雑音に対する有意差で判定）
   - 色・形（矩形・角丸矩形と半径・円・楕円）・最終配置
5. **JSONに保存**。各項目に確からしさ `status` を付ける。

| status | 意味 |
|---|---|
| `measured` | フレームから直接測った |
| `estimated` | 当てはめ等で推定した（`uncertaintyFrames` 等を併記） |
| `ambiguous` | 候補が雑音に対して区別できない（並ぶ候補を併記） |
| `upper_bound` / `lower_bound` | 片側だけ分かる（例: 開始は「最初に見えたフレーム以前」） |
| `unknown` | 観測できない・解析できない（`reason` を必ず書く） |

例: 画面外から滑り込む長方形の開始時刻は `upper_bound`（16フレーム以前）、開始位置は `unknown` と出ます。当てはめ上の開始時刻 `modelFrame` は ±9.5フレームの幅で識別できないため、参考値にとどめ判定には使いません。観測できない項目の一覧は `unresolved` にまとまります。

`elements[].render` は再現用のデータ（中心・大きさ・角度・不透明度のチャンネルと、区間ごとのイージング。イージングが `unknown` の区間は測定値の折れ線）です。Remotionの合成（`src/Reproduction.tsx`）はこれを `interpolate()` と `Easing` で評価し、SVGで描きます。**図形が参考動画で観測されたフレームだけ描きます**（観測できない区間をモデルで外挿して描かない）。

## 比較と判定（`tools/compare.ts`）
- 画素: SSIM平均 ≥ 0.98、最小 ≥ 0.95、PSNR平均 ≥ 35dB
- 動き（生成動画を同じ解析器で測る）: 位置・大きさの差 ≤ 1.5px、角度 ≤ 1度、不透明度 ≤ 0.05、開始・終了・見え始めの差 ≤ 1フレーム、種類とイージングが一致
- 開始（終了）が観測できない動きは、不確かさが1フレーム以下のモデル時刻だけを比べ、それ以外は「識別不能」として判定に使いません（見え始めと各フレームの軌跡で判定）。
- 独自配色（house）は見た目を意図的に変えるため、画素・形・大きさ・見え始めを判定に含めず、位置・角度・不透明度・時刻・イージングで判定します。

## 検証結果（2026-10-10、合成動画、`out/final`）
- 正解照合: 67/67。開始が観測できない4件はすべて `upper_bound` と開始値 `unknown` で報告（断定しない）。
- 再現（measured）: SSIM平均0.99939・最小0.99889、PSNR平均48.41dB。6図形とも動きの差が基準内（位置の最大誤差0.19px、イージング6/6一致）。
- 独自配色（house）: 動きの判定に合格。
- 差異の修正の経緯（1回目の比較で見つかった問題と直したこと）は、作業ログ（`logs/2026-10-10/232110-T110-15494c02/`）とチケットT110に記録しています。

## 方針と制約
- **素材の権利**: 動画の取得機能は持ちません。解析には `--rights` で利用許可の根拠の記録が必須で、`analysis.json` の `source.rightsNote` に残ります。再現は自作のSVG図形だけで描き、元動画の画素・音声・フォント・ロゴは使いません。音声は解析も再現もしません。
- **断定しない**: 観測できない項目は `unknown` / 上限・下限として理由を残します。
- **Remotionのライセンス**: 個人・従業員3人以下の営利組織・非営利・**導入の評価**は無料ライセンスの対象です。4人以上の営利組織が商用に使う場合はCompany Licenseが必要です（https://www.remotion.dev/docs/license/faq 、2026-10-10確認）。本環境は評価目的で導入しました。商用利用の判断は本人が行います（T111）。
- **Remotion公式Agent Skills**: `remotion-dev/skills` の `remotion-best-practices`（他のSkillをすべて内包するルーター）をコミット `32b241b`（Skillのversion 4.0.534）で `../.agents/skills/remotion-best-practices/` に取り込んでいます。取得・照合は `node tools/fetch-remotion-skills.ts [--check]`（記録は `remotion-skills.lock.json`。地図のSkillは未使用で見本データが大きいため除外）。プロジェクトの作成（create-video）、合成の登録・`calculateMetadata`・`interpolate`/`Easing`・`premountFor`、レンダリングはこのSkillの手順に従いました。Remotionの版はSkillと同じ4.0.534に固定しています。

## 既知の問題と限界
- 既定のChrome Headless Shell（Chromium 157）は、この開発端末（macOS 26 / Darwin 25.6）で `requestAnimationFrame` が進まず「Waiting for root component to load」で止まりました（未改変の雛形でも再現。サンドボックス外・GL切替でも同じ）。公式の代替 `Config.setChromeMode("chrome-for-testing")` を `remotion.config.ts` で使っています。
- 対象は「単色背景の上の、重ならない単色図形」です。文字・写真・グラデーション・重なり・遮蔽・3D・粒子・ディゾルブ等の切替効果は解析しません（`unresolved` に記録）。
- 正方形・円など等方的な図形の回転は2次モーメントでは測れません。回転と拡大縮小が同時に起きる動き、回転する角丸矩形の大きさ（矩形の式で測るため数px偏る）は正確に測れません。
- イージングは14候補からの選択です。候補にない形（ばね・任意のベジェ等）は `unknown` とし、再現は測定値の折れ線で行います（ベジェの当てはめは未実装）。
- 色はH.264（yuv420p）で圧縮した後の値です。
- 実在の参考動画での検証は未実施です（許可済み素材の用意はT111）。
