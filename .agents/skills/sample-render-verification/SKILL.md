---
name: sample-render-verification
description: このリポジトリ（scripts/runとsrc/cli.ts sampleでMP4を生成する動画制作サービス）で、台本や描画を変えた後に、既存outputsを変えない隔離コピーで動画を生成し、媒体検査と実再生（ブラウザー）・実デコードしたフレームの目視までを行って証跡に残す。生成経路の変更を「実再生まで確認した」と報告する前に使う。別構成のリポジトリや、課金・外部APIを伴う生成には使わない。
---
# 隔離生成と実再生の確認

正本はリポジトリのREADME・docs/AGENT-WORKFLOW.md・AGENTS.md。証跡の保存規則は `.agents/skills/repository-task-closeout/SKILL.md` に従う。ここでは動画固有の手順だけを書く。

## 1. 隔離コピーで生成する
- 利用者のoutputs/を増やさない・整理しない。作業用ディレクトリ（エージェントの一時領域など）へ `src scripts fixtures config prompts package.json` を複製し、`work/python-deps` だけはリポジトリへのsymlinkにする（FFmpegの再取得を避ける）。
- `work/swift-cache`・`work/render`・`work/render-source` はコピーしない。Swiftのモジュールキャッシュは作成時のパスを覚えており、別パスで使うとswiftcが「compiled with module cache path …」で失敗する（T104で発生）。描画プログラムはコピー先で再コンパイルされる（約20秒）。
- Node 24以上を `NODE_BIN` で明示し、コピー先で `./scripts/run src/cli.ts sample --plan <台本>`（必要なら `--subtitles` `--resolution`）を実行する。終了コードと「生成完了」の行を保存する。
- 人の工程を通す経路（制作案件）を試す場合も、コピー先のoutputsで行い、記録者はtest-agent等にして本番の人の入力と混同しない。デモ案件の流れ: `produce new --demo --candidates fixtures/topic-candidates-demo.json --by test-agent` → `select` → `reflection --text 'デモ用の仮の考察です（本人の考察ではありません）…'` → `script --plan fixtures/draft-general-demo.json` → `script-review approve --hash <表示された台本の版>` → `render`。考察が未入力・台本が未承認の段階で `render` が拒否されることも記録する。

## 2. 自動検査を読む
`outputs/<job>/media-check.json`（フレーム数一致、全デコード、PSNR最小、音声長、字幕ストリーム、narration）と `job.json`（lint、metadata、readability、thumbnails）、`metadata.json` を確認し、値を記録する。自動検査の合格を実再生の代わりにしない。

## 3. ブラウザーで実再生する
- コピー先で `./scripts/run src/cli.ts serve` をバックグラウンド起動し（ポート4173の空きを先に確認）、組み込みブラウザーで `/job/<id>` を開く。
- `<video>` の readyState・duration・videoWidth/Height・error、textTracksのcue数を取得する。ミュートで `play()` し、currentTimeの進行を確かめる。
- ブラウザーのペインが非表示だと、ミュート動画は約20秒ごとに一時停止される。`pause` を検知したら `play()` で再開するループで `ended` まで再生する（1回のスクリプトは45秒以内で返す）。表示された字幕cue、dropped frames、`webkitAudioDecodedByteCount` の増加を記録する。
- 非表示ペインのスクリーンショットには映像面が描かれないことがある。映像の目視は、MP4からFFmpegで代表フレームをデコードしてタイル画像にして行う（例: `-vf "select='eq(n,48)+eq(n,600)',scale=640:-1,tile=2x1" -frames:v 1 -fps_mode passthrough`）。焼き込み字幕はこの画像で、ソフト字幕はブラウザーの字幕表示で確認する。
- 終わったらサーバーを止める。

## 4. 書き方
- 音声が自作の確認音なら「確認音（ナレーションではない）」と明記し、スピーカーで聴いていなければその旨を書く。
- 何を見て何を確かめたか（時刻・フレーム番号・cue）を具体的に書く。見られなかったものは未確認とする。
- 動画本体（mp4/wav）はログに入れない。小さなJSON・VTT・PNGだけを証跡にする。
