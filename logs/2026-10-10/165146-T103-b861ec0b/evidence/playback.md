# 実再生の記録（T103-6、2026-10-10 UTC、Claude Code）
対象: 隔離コピー（scratchpad/iso-t103。リポジトリのsrc/scripts/fixtures/config/prompts/package.jsonを複製し、work/python-depsはリポジトリへのsymlink）で生成した outputs/price-index-demo-ed1c2150/sample.mp4。リポジトリのoutputs/は変更していない。

生成: `NODE_BIN=… ./scripts/run src/cli.ts sample --plan fixtures/sample-general.json`（隔離コピー内。約30秒。終了0、「生成完了」）

## 自動検査（media-check.json / job.json）
- 68秒、1632/1632フレーム、全デコード成功、PSNR最小38.9 dB（基準30）、音声68.01秒、ソフト字幕1本（既定soft）、narration=false（確認音）。
- lint error 0 / warning 0、metadata ok（チャプター4つ、導入文・出典1件）、見やすさok（最小17pt相当、最小コントラスト比7.55）、サムネイル3案ok。

## 組み込みブラウザーでの実再生（隔離コピーで `cli.ts serve` → http://127.0.0.1:4173/job/price-index-demo-ed1c2150）
- `<video>`: readyState 4、duration 68、1280×720、error null。字幕トラック「日本語」mode showing、cue 14件。
- ミュートで再生。currentTimeが実時間で進行（4秒で3.96秒）。ペインが非表示のため約20秒ごとにブラウザーが一時停止したので、停止時にplay()で再開して最後まで再生（pause@19.6/27.6/38.0/48.6/58.9 → ended、currentTime 68）。error null、dropped frames 0。
- 再生中に表示された字幕cueは14件すべて（最終cue「学習用の解説です。実践の結果を保証するものではありません。」を画面でも確認）。
- 音声: webkitAudioDecodedByteCountが再生に合わせて増加（2766→60897バイト）＝AAC音声トラックのデコードを確認。音声の内容は自作の確認音（各場面冒頭の短い正弦波）で、ナレーションではない。スピーカーでの試聴はしていない。
- 映像面: ペイン非表示のためスクリーンショットに映像は描画されなかった。代わりにMP4からFFmpegでフレーム48/312/600/800/1150/1560をデコードし、decoded-frames.pngで文字・図解（段階表示・強調枠）・「架空の例」札・出典表示・章ラベルを目視確認。焼き込み字幕ではないため字幕はフレームに含まれない（ブラウザーの字幕表示で確認）。

## 目視で気づいた点（T106で扱う）
- flowの番号（01〜03）が枠の上端に接し、出現直後の強調枠が「03」に重なる。
- 「架空の例」の札で文字が枠の中央からずれている。
- compareの項目が枠の上に寄り、下部が空く。
