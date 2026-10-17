---
name: sample-render-verification
description: このリポジトリ（scripts/runとsrc/cli.ts sampleでMP4を生成する動画制作サービス）で、台本や描画を変えた後に、既存outputsを変えない隔離コピーで動画を生成し、媒体検査と実再生（ブラウザー）・実デコードしたフレームの目視までを行って証跡に残す。生成経路の変更を「実再生まで確認した」と報告する前に使う。別構成のリポジトリや、課金・外部APIを伴う生成には使わない。
---
# 隔離生成と実再生の確認

正本はリポジトリのREADME・docs/AGENT-WORKFLOW.md・AGENTS.md。証跡の保存規則は `.agents/skills/repository-task-closeout/SKILL.md` に従う。ここでは動画固有の手順だけを書く。

## 1. 隔離コピーで生成する
- T139/T145のoutputs保護検査とT156のcwd誤指定を踏まえ、実行前に元outputsの相対パス・サイズ・mtime・SHA-256とlatest.jsonの内容を小さな証跡へ保存する。隔離先に置いたスクリプトでも、起動元のcwdは変わらない。生成コマンドは隔離先をcwdに明示し、ハーネスは開始時に実cwdと予定した隔離ルートを照合して、不一致なら書込み前に停止する。実行後は元outputsとマニフェストを照合する。
- 利用者のoutputs/を増やさない・整理しない。作業用ディレクトリ（エージェントの一時領域など）へ `src scripts fixtures config prompts assets package.json` と `motion-lab/src`・`motion-lab/shared` を複製し、`work/python-deps` だけはリポジトリへのsymlinkにする（FFmpegの再取得を避ける）。nativeでもprovidersのimport経由でRemotionの変換モジュールを参照するため、そのソースは必要。`--renderer remotion` を隔離先で使う場合は、さらに `motion-lab` の `tools package.json remotion.config.ts tsconfig.json public` を複製し、`motion-lab/node_modules` をリポジトリへのsymlinkにする（T187: `tools/render-plan.mjs` を実行するため。参考動画 `reference*.mp4` と `out/` は複製しない）。
- `work/swift-cache`・`work/render`・`work/render-source` はコピーしない。Swiftのモジュールキャッシュは作成時のパスを覚えており、別パスで使うとswiftcが「compiled with module cache path …」で失敗する（T104で発生）。描画プログラムはコピー先で再コンパイルされる（約20秒）。
- Node 24以上を `NODE_BIN` で明示し、コピー先で `./scripts/run src/cli.ts sample --plan <台本>`（必要なら `--subtitles` `--resolution`）を実行する。終了コードと「生成完了」の行を保存する。
- 検査が失敗する入力（文字配置の不合格など）を試す場合は、fixtureを短く切り詰めずに対象の値だけを差し替える。最終場面の免責などの安全検査（lint）が先に止めると、確かめたい検査まで届かない（T187）。
- 人の工程を通す経路（制作案件）を試す場合も、コピー先のoutputsで行い、記録者はtest-agent等にして本番の人の入力と混同しない。デモ案件の流れ: `produce new --demo --candidates fixtures/topic-candidates-demo.json --by test-agent` → `select` → `reflection --text 'デモ用の仮の考察です（本人の考察ではありません）…'` → `script --plan fixtures/draft-general-demo.json` → `script-review approve --hash <表示された台本の版>` → `render`。考察が未入力・台本が未承認の段階で `render` が拒否されることも記録する。

## 2. 自動検査を読む
実ナレーションでは、合成した各cueのPCM長が割当て枠以下で、超過時に切り捨てず停止することも確認する。MP4の全デコード・総尺一致だけでは途中の発話切捨てを検出できない（T170/T179）。
`outputs/<job>/media-check.json`（フレーム数一致、全デコード、PSNR最小、音声長、字幕ストリーム、narration）と `job.json`（lint、metadata、readability、thumbnails）、`metadata.json` を確認し、値を記録する。自動検査の合格を実再生の代わりにしない。

## 3. ブラウザーで実再生する
- コピー先で `./scripts/run src/cli.ts serve` をバックグラウンド起動し（ポート4173の空きを先に確認）、組み込みブラウザーで `/job/<id>` を開く。
- `<video>` の readyState・duration・videoWidth/Height・error、textTracksのcue数を取得する。ミュートで `play()` し、currentTimeの進行を確かめる。
- ブラウザーのペインが非表示だと、ミュート動画は約20秒ごとに一時停止される。`pause` を検知したら `play()` で再開するループで `ended` まで再生する（1回のスクリプトは45秒以内で返す）。表示された字幕cue、dropped frames、`webkitAudioDecodedByteCount` の増加を記録する。
- 非表示ペインのスクリーンショットには映像面が描かれないことがある。映像の目視は、MP4からFFmpegで代表フレームをデコードしてタイル画像にして行う（例: `-vf "select='eq(n,48)+eq(n,600)',scale=640:-1,tile=2x1" -frames:v 1 -fps_mode passthrough`）。焼き込み字幕はこの画像で、ソフト字幕はブラウザーの字幕表示で確認する。独立した全デコードは `ffmpeg -i sample.mp4 -map 0:v -map 0:a -f null -` とする（`-map 0` はmov_text字幕ストリームでnull出力のエンコーダー選択に失敗する。zshでは `0:a?` がglobになるので使わない。T187）。
- 終わったらサーバーを止める。

### ブラウザー・localhostが使えない場合
- `serve` がlisten EPERMになった、またはブラウザー操作が利用できない場合は、制限を回避せず理由を記録する。Remotionで生成した動画は描画できない場合もあるため、ブラウザー障害をChromeの正常確認と扱わない。
- MP4が存在する場合は、macOSのAVPlayerで無音の実再生を行い、再生準備・duration・currentTimeの進行・endedを記録する。`swift scripts/verify-avplayer-playback.swift <path-to-mp4> 8 180` を使える。長尺ではrateを上げてよいが、指定値を証跡へ残す。
- AVPlayerはブラウザーのtextTracks・画面上の操作・字幕選択を確認しない。それらは未確認と分け、MP4を全フレーム/音声デコードし、実デコードPNGで焼き込み字幕・画面を目視する。再生終了だけで映像品質合格とはしない。
- AVPlayerも利用できない場合は自動の全デコードとPNG目視までを実施し、実再生は未確認のままにする。

## 4. 書き方
- 音声が自作の確認音なら「確認音（ナレーションではない）」と明記し、スピーカーで聴いていなければその旨を書く。
- 何を見て何を確かめたか（時刻・フレーム番号・cue）を具体的に書く。見られなかったものは未確認とする。
- 動画本体（mp4/wav）はログに入れない。小さなJSON・VTT・PNGだけを証跡にする。

### 動きや登場を変更した場合（T145の初回・差戻し試作から）
- 完成状態の代表フレームだけでは、途中の動きがない不具合を見逃す。最初の登場だけでなく、場面開始から遅れて出る要素も選び、登場の前後約1秒を完成MP4から細かい間隔で復号して確認する。
- 設定した移動/フェードが進行すること、後続要素の登場で既出要素が巻き戻らないことを確認する。コードの進捗値だけでなく、完成MP4の連続フレームまたは通常速度の再生を証跡にする。native/Remotion等の複数経路が対象なら各経路で行う。
- 観察した参考動画の時刻・サンプリング間隔と、実装で選んだ秒数/曲線を分けて記録する。静止画や粗い時刻間隔から正確なイージング曲線を断定しない。
