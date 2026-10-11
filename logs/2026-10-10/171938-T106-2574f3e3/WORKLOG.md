# 作業記録 T106
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-10T17:19:38.791Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
docs/CLAUDE-IMPLEMENTATION-BATCH.mdに基づく一括実装依頼のうちT106（参考動画の観察、構成案と短い試作、文字ずれの再現と修正、題材を説明する動き、焼き込み字幕の既定化、サムネイル再案、統合試作と比較用パッケージ）を行う。無料のローカル描画のみ。参考動画の素材は複製しない。本人の構成確認・サムネイル選択は代行せずreviewで残す。課金・投稿・commit/pushはしない。
利用者の依頼（チャット）: T103/T104/T106/T108を順に実装・検証・記録。公式情報の読取調査、ローカル実装、無料の描画・試験は可。本人の承認は代行しない。

## 実施内容・変更ファイル
- 106-1 参考動画: 組み込みブラウザーでチャプター一覧・シーク用プレビュー画像27コマ・公開サムネイルを観察（音声・動き方は未確認）。docs/T106-DESIGN.md 1〜2章（原回答→観察→対応の表）。
- 106-2 構成案: docs/T106-DESIGN.md 3章、fixtures/draft-price-index.json（導入→身近な例→仕組み→本人の考察→活かし方→まとめの83秒の下書き、開発用と明記）。src/lint.ts（本人の考察の章はchapter-recapの対象外）。
- 106-3 文字ずれ: fixtures/layout-stress.json（検査用、長い見出し・二行字幕・英数字）で旧描画を再現。scripts/render.swift を全面的に書き直し（boxText: 入れ物の枠に対する計測と中央配置、区画ZONE_*、札・強調語・字幕・フッター・各図解の配置）。src/layout.ts（新規、文字配置の検査）、src/commands/sample.ts（job.layout）、src/commands/serve.ts（文字配置の表示）。
- 106-4 動き: src/plan.ts（meter図解、flowのmotion: travel、diagram.reveal、diagramStepsの移設）、src/timeline.ts（MOTION_FRAMES、hasMotion、1フレームずつの区間、reveal）、src/lint.ts（meterの文言の検査）、scripts/render.swift（drawMeter、arrowLine、travel）。
- 106-5 字幕・サムネイル: DEFAULT_SUBTITLES='burn'（src/commands/sample.ts）、thumbnail.keyword/contrast（src/plan.ts）、thumbContrast・ThumbSpec（src/timeline.ts）、サムネイル3案とdrawThumbDiagram（scripts/render.swift）、改行を除いた禁止表現検査（src/lint.ts）。
- 106-6 統合: 隔離コピーでデモ案件を通して720p/1080pを制作・実再生。比較用パッケージ outputs/T106-review-2026-10-10/（README.md、比較画像、新旧サムネイル、試作MP4 2本、代表フレーム）。
- 試験: tests/presentation.test.ts（新規9件）、tests/plan.test.ts（既定字幕の試験をburnへ更新、理由を記載）。
- 文書: docs/DECISIONS.md ADR-019、docs/PRODUCTION-GUIDELINES.md、docs/SPEC.md、README.md、docs/HANDOFF.md（T103/T104/T106の追補と不変条件の変更）、docs/STATUS.md、tickets/T106.md。

## 判断と理由
- 文字ずれの原因は、NSStringを「高さ100の固定枠」に描くと枠の上端から配置されることで、要素ごとにy座標を手で合わせていたこと。個別の座標調整ではなく、入れ物の枠を明示して計測・中央配置する共通関数に置き換え、描いた位置を記録して自動検査できるようにした（再発防止）。フォントの縮小だけで解決しない（既定の最大サイズは維持、収まらないときだけ従来どおり縮小）。
- 字幕の既定を焼き込みへ変更: 本人の明示の希望を研究上の一般論（E12）より優先。soft/bothは残し、ナレーション接続後に再評価する（ADR-019）。焼き込み字幕と図解・強調語が重ならないよう、強調語を題名の下の区画へ移した。
- 動きは「何の説明を助けるか」を言えるものだけ（演出の指針の追加前チェックをdocs/T106-DESIGN.md 4章に記録）。集計の図は物価指数の意味（多くの品目の動きをまとめる）に直結し、数値を出さず架空の例と明示して誤解・煽りを避けた。経緯の矢印は手順・因果の段の出現と同期させた。段の表示を字幕の時刻に合わせるrevealを入れ、動きと説明の時刻を一致させた。
- 参考動画は、非表示ペインで映像が描かれないため、YouTube自身のシーク用プレビュー画像を表示して観察した（ファイル保存・複製なし）。見られなかった音声・動き方は未確認と明記し、視聴したとは書かない。
- サムネイルは参考動画の原則（短い見出し・一つの対比・一色の強調）を取り入れた独自の3案。初回の案aで見出しが不自然に改行され、案bの図解が小さすぎたため、明示の改行と大きく描く図解に直した。改行で禁止表現の検査をすり抜けられないよう、改行を除いて検査する。
- 本人の確認（構成・動き・サムネイル・字幕・文字ずれの解消）が残るためreviewとした。全件doneを装わない。
- routine-to-skill評価: T103で作成したsample-render-verificationを今回の統合試作の生成・実再生に適用（試用）し、手順どおりで足りた（ペイン非表示時の再開ループ、実デコードフレームでの目視、Swiftキャッシュをコピーしない）。Skillの追加変更は不要。旧描画との前後比較画像の作成は今回1回のみで、反復の根拠がないためSkill化しない。同じ作業回での再評価はしない。

## 検証コマンド・結果・証跡
- 修正前の再現: 隔離コピー（scratchpad/iso-t106-before、変更前のrender.swift）で `sample --plan fixtures/layout-stress.json --subtitles burn`（720/1080）と `sample --plan fixtures/sample-v2.json --resolution 1080`。ずれ6種を画像で確認（evidence/text-layout/compare-*.png の上段）。
- 修正後: 隔離コピー（scratchpad/iso-t106-after）で同じ台本・条件と既定（burn）を生成。文字配置 ok（556/645/708件）、見やすさ ok、PSNR最小38.7〜40.5 dB、フレーム数一致（evidence/text-layout/after-checks.txt、compare-*.pngの下段）。既存fixture（v1、一般テーマ）も合格（evidence/regression-existing-fixtures.txt）。
- 文字配置の検査が旧描画のずれ（番号のはみ出し、字幕の上寄り、字幕とフッターの重なり、強調語と図解の重なり、区画外）を検出することを、記録の形で再現した試験で確認（tests/presentation.test.ts）。
- 対象試験: `./scripts/run --test tests/presentation.test.ts tests/timeline.test.ts tests/media.test.ts tests/readability.test.ts tests/thumbnails.test.ts tests/plan.test.ts tests/lint.test.ts` → tests 80 / pass 80 / fail 0 / skipped 0、EXIT=0（evidence/target-tests.txt）。媒体の試験はFFmpegありで実行（skipなし）。
- 全体: tests 191 / pass 191 / fail 0、EXIT=0（evidence/all-tests.txt）。型検査 EXIT=0（evidence/typecheck.txt）。途中で既定字幕の試験1件が意図した変更で失敗し、理由を記して更新した。
- 統合試作と実再生: evidence/playback.md、evidence/integrated/（produce-flow.txt、各ジョブのjob.json・media-check.json・metadata.json・lint.json・subtitles.vtt、script-v2.json、integrated-frames.png、motion-frames.png、thumbs-after2.png）。720p: 83秒、1992/1992フレーム、dropped 0、error null、音声デコード増加、最後までended。
- 参考動画の観察方法: evidence/reference-observation.md。

## 未実施・制約
- 本人の確認（構成・動き・サムネイル・字幕・文字ずれ）はしていない（代行しない）。T106はreview。
- 参考動画の音声・ナレーション・動き方、2:50〜4:30と5:50以降の画面は見ていない。
- 音声は自作の確認音のままで、ナレーションの速さ・聞きやすさは未検証。試作は83秒で、10〜20分の長尺の品質を検証したものではない。スピーカーでの試聴はしていない。
- 描画の変更で、旧来の「v1の描画はM1とバイト一致」という不変条件は意図して崩した（HANDOFF追補に記録）。
- 人型・物の絵（参考動画のような絵柄）は今回作っていない。本人の回答で必要なら別途検討する。
- outputs/ の既存ジョブは変更していない（新しいフォルダT106-review-2026-10-10だけ追加）。commit/push・課金・投稿はしていない。

## TODO・再開方法
- 本人がoutputs/T106-review-2026-10-10/README.mdを見て質問1〜5に回答 → 新しい作業回で記録し、必要な修正（構成の順番、動き・絵の追加、サムネイルの方向、字幕の枠）を行ってからT106をdoneにする。
- 次はT108（課金なしのサービス比較）。`./scripts/run src/cli.ts check` の後にstartする。
