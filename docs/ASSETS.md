# 素材台帳
- 台本・見出し・架空の場面: fixtures/sample.json（M1）とfixtures/sample-v2.json（2026-10-08、T041）。いずれも本作業で新規作成した架空の練習例。v2も出典なし・数値の主張なし。他者の文章・銘柄・実相場の引用なし。金融上の推奨ではなく記録方法のデモ。
- 図解・背景・矢印: scripts/render.swiftの幾何描画。本作業で作成。外部画像・映像なし。
- T145のスーパースター市場イラスト: scripts/render.swiftの独自AppKit図形とmotion-lab/src/primitives/SuperstarIllustration.tsxのSVG図形（注目の集中、順位/受け皿の非対称、配信の到達）。コードから作図し、既存の参考動画のフレーム・画像・音声は使わない。区分: original / Project In-house、帰属表示不要、プロジェクト内での商用利用可、確認日: 2026-10-15。法的な包括保証ではない。
- T145差戻し改修（2026-10-15）: `src/illustration.ts`の人物輪郭を新規に作図。首・肩・上腕/前腕・腰・左右の脚・足先を独自のBézier輪郭で表現し、両描画経路で共用。reference1/reference2はT111で利用者が指定したローカル研究・解析の範囲で観察し、画素・音声・トレースは生成物へ含めない。参考素材自体の権利を取得したという意味ではない。
- 音: src/providers.tsで正弦波を数式から作成。録音・音声モデル・音楽素材なし。場面の開始に0.7秒の確認音、その他は意図的な無音。ナレーションではない。
- フォント: macOSのシステムフォントで画像化。フォントファイルを複製・配布しない。別OSへの再配布は対象外。
- 映像書出し: AppKitで画像を描画し、FFmpegで書き出す（ADR-007。AVFoundationの書出しは置換済み）。外部素材のダウンロードはなし。

ユーザーのローカル試作で利用する自作素材。外部素材の利用権を購入したこと、第三者権利に関する包括保証を意味しない。公開前にT007/T021で台本と採用音声等の権利を確認する。

## サムネイルオリジナル素材（T162、2026-10-16）
`assets/thumbnail-originals/` 内の自作SVG素材。公開サムネイル画像の直接トレース・画素切り抜き・ブランド画像を含まず、幾何学およびT145自作輪郭から作図したオリジナル素材。自作/利用根拠: Project In-house、プロジェクト内での商用利用可、確認日: 2026-10-16。
- `asset:person-solo` (`assets/thumbnail-originals/person-solo.svg`, SHA-256: `1eab09eb2da933e1860e092821607b33a329fab57d89543d77a05d0f1615aab9`): 単独の人物シルエット（格差・スーパースター・孤独の象徴）。
- `asset:crowd-silhouette` (`assets/thumbnail-originals/crowd-silhouette.svg`, SHA-256: `6026ebbabd30355899c22cd8b980f21b9cdbf5fef2ad2c713c1cedffd6e20bce`): 多数の人々・群衆・市場の聴衆シルエット。
- `asset:branching-tree` (`assets/thumbnail-originals/branching-tree.svg`, SHA-256: `9785ce315feee03d389a0bb76137d66d4afb61b0ff0459debc8da85c6e8c59bd`): 家系分岐と途絶（バツ印）・残存を表す確率ツリー図。
- `asset:convergence-arrow` (`assets/thumbnail-originals/convergence-arrow.svg`, SHA-256: `66ba5d5daac393b487be35efbeed681e2bc72f725ef8a0736e678817d55bf115`): 多数の選択肢から単一先へ収束する集約矢印。
- `asset:moon-glow` (`assets/thumbnail-originals/moon-glow.svg`, SHA-256: `6ec8c6f1433d66338a661d75503b1a3d518bd80854c570bcdf86ef1fb524e4c1`): 夜空に輝く大きな月の自作グラデーション幾何図形。
- `asset:smartphone-frame` (`assets/thumbnail-originals/smartphone-frame.svg`, SHA-256: `a557db78db7a9e03a1d17894d4e6a40bb21df81b5d561740b81deecf3fe78524`): スマホ画面枠と、その画面内に小さく写る月の自作幾何図形。
※プレビュー生成・縮小比較は `scripts/generate-thumbnail-previews.ts` により `work/thumbnail-previews/index.html` へ出力。実データ数値との誤認を防ぐため抽象的幾何学表現に留めている。

書出しの最終構成はFFmpeg。imageio-ffmpeg 0.6.0（BSD-2-Clauseラッパー）の同梱FFmpegは別ライセンス。`ffmpeg -L`と`-version`の出力をdocs/toolchain.txtに保存。バイナリを本リポジトリから配布しない。取得先: https://pypi.org/project/imageio-ffmpeg/0.6.0/ 。

## motion-lab（T110、2026-10-10）
- 検証用の参考動画: motion-lab/tools/make-reference.ts が数式から描く10秒の合成動画（矩形・円・帯・回転する棒・フェードする帯）。本作業で作成。外部の映像・音声・フォントなし。生成物はGit対象外（motion-lab/out/）。
- 再現の描画: motion-lab/src/Reproduction.tsx のSVG図形（本作業で作成）。元動画の画素・音声は使わない。独自配色（house）の色も本作業で選んだもの。
- Remotion公式Agent Skills: .agents/skills/remotion-best-practices/（remotion-dev/skills、コミット32b241b97f4e0e4ab61fe9a41b05e6e64503f8c5）をRemotion社の文書として版固定で複製。取得元 https://github.com/remotion-dev/skills 。改変していない（SHA-256はmotion-lab/remotion-skills.lock.json）。
- Remotion本体（4.0.534）とChrome for Testingはnpm・Remotionの公式手順で取得し、node_modules/に置く（Git対象外）。Remotionの利用条件は https://www.remotion.dev/docs/license/faq （2026-10-10確認。評価は無料、従業員4人以上の営利組織の商用利用はCompany License）。
