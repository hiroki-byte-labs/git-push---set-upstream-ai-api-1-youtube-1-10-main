# 素材台帳
- 台本・見出し・架空の場面: fixtures/sample.json（M1）とfixtures/sample-v2.json（2026-10-08、T041）。いずれも本作業で新規作成した架空の練習例。v2も出典なし・数値の主張なし。他者の文章・銘柄・実相場の引用なし。金融上の推奨ではなく記録方法のデモ。
- 図解・背景・矢印: scripts/render.swiftの幾何描画。本作業で作成。外部画像・映像なし。
- 音: src/providers.tsで正弦波を数式から作成。録音・音声モデル・音楽素材なし。場面の開始に0.7秒の確認音、その他は意図的な無音。ナレーションではない。
- フォント: macOSのシステムフォントで画像化。フォントファイルを複製・配布しない。別OSへの再配布は対象外。
- 映像書出し: AppKitで画像を描画し、FFmpegで書き出す（ADR-007。AVFoundationの書出しは置換済み）。外部素材のダウンロードはなし。

ユーザーのローカル試作で利用する自作素材。外部素材の利用権を購入したこと、第三者権利に関する包括保証を意味しない。公開前にT007/T021で台本と採用音声等の権利を確認する。

書出しの最終構成はFFmpeg。imageio-ffmpeg 0.6.0（BSD-2-Clauseラッパー）の同梱FFmpegは別ライセンス。`ffmpeg -L`と`-version`の出力をdocs/toolchain.txtに保存。バイナリを本リポジトリから配布しない。取得先: https://pypi.org/project/imageio-ffmpeg/0.6.0/ 。

## motion-lab（T110、2026-10-10）
- 検証用の参考動画: motion-lab/tools/make-reference.ts が数式から描く10秒の合成動画（矩形・円・帯・回転する棒・フェードする帯）。本作業で作成。外部の映像・音声・フォントなし。生成物はGit対象外（motion-lab/out/）。
- 再現の描画: motion-lab/src/Reproduction.tsx のSVG図形（本作業で作成）。元動画の画素・音声は使わない。独自配色（house）の色も本作業で選んだもの。
- Remotion公式Agent Skills: .agents/skills/remotion-best-practices/（remotion-dev/skills、コミット32b241b97f4e0e4ab61fe9a41b05e6e64503f8c5）をRemotion社の文書として版固定で複製。取得元 https://github.com/remotion-dev/skills 。改変していない（SHA-256はmotion-lab/remotion-skills.lock.json）。
- Remotion本体（4.0.534）とChrome for Testingはnpm・Remotionの公式手順で取得し、node_modules/に置く（Git対象外）。Remotionの利用条件は https://www.remotion.dev/docs/license/faq （2026-10-10確認。評価は無料、従業員4人以上の営利組織の商用利用はCompany License）。
