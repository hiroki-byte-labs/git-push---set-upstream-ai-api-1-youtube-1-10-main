# 作業記録 T139
- 記録者・実施者: Codex
- モデル: GPT-6 (runtime)
- 開始日時: 2026-10-14T15:08:13.159Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T139の継続調査。隔離コピーでRemotionのChrome起動障害原因を確認し、既存の合成素材・承認デモに対し可能なローカル修復/再実行経路を検証。実API・認証・課金・投稿なし。既存outputs不変更。

## 実施内容・変更ファイル
 - 既存の隔離コピー `/private/tmp/T139-render-nti1mann` 内で、既承認の合成デモ2件をnative rendererで別jobとして再生成。短尺 `t139-short-mock-75b5a0e9`、長尺 `t139-long-mock-91612294`。主要outputsには書き込まず、元の2,248ファイルの名前/サイズ/mtime ns/SHA-256を開始時マニフェストと比較し差分0。
 - `scripts/verify-avplayer-playback.swift` を追加。macOS AVPlayerで無音再生し、準備状態・duration・再生時刻の進行・endedをJSONで記録する。ブラウザー/localhost利用不可時に使う条件・未確認範囲を `.agents/skills/sample-render-verification/SKILL.md` に追記し、今回の短尺/長尺へ適用。
 - `tickets/T139.md` をdoneへ更新。`docs/STATUS.md`、`README.md`、`docs/SPEC.md` の検証境界を、native経路で実MP4/再生済み・Remotion固有経路は未検証に更新。
 - MP4本体/WAV/PCMはリポジトリへ保存しない。独立検査JSON、AVPlayer結果、Chrome診断、代表デコードPNG6枚、コマンド証跡を本作業回のevidenceに保存。

## 判断と理由
 - T139の受入条件はshort/long実MP4、媒体検査、字幕/音声同期、実再生でありrendererを指定していない。RemotionのChrome Headless ShellはHTML dump 12秒・PNG capture 20秒でタイムアウトしCVDisplayLinkエラー、Safari操作も利用不可、localhost serveは既存試行でEPERMだったため迂回しない。実MP4受入れは既存production native rendererで満たし、Remotion固有の描画品質合格とは区別する。
 - 音声cueとVTTの全41 start/endが完全一致し、MP4 mov_textから抽出した41cueもVTTと同じ。native MP4で焼き込み字幕・構成を冒頭/中間/末尾の実デコードPNGで確認する。AVPlayerはブラウザーUI/textTracks選択を確認しないため、その範囲は引き続き未確認。
 - 定型作業のSkill評価（routine-to-skillを適用）: T084と前回T139でlocalhost/Safari利用不可が反復し、同じ生成MP4の実再生を止めていた。既存sample-render-verification SkillにAVPlayer fallbackと限界を追加し、共有スクリプトを作って短尺・長尺へ試用した。closeout Skillと検査手順の既存範囲を再実装する新Skillは作成しない。

## 検証コマンド・結果・証跡
 - `./scripts/run src/worklog-cli.ts start T139 --agent Codex --model GPT-6 --model-source runtime ...`: 終了0、作業回を開始。既存check/nextで対象チケットと依存・状態を確認済み。README、SPEC、STATUS、AGENT-WORKFLOW、T139、独立作業一覧を読んだ。
 - Remotion Chrome診断: headless-shell `--version` はChromium 157.0.8080.0で終了0。ローカルdata URLのHTML dumpは12秒、PNG captureは20秒でタイムアウトし、`CVDisplayLinkCreateWithCGDisplay failed -6670`。実結果は `evidence/chrome-headless-diagnostic.json` と `chrome-headless-screenshot-test.txt`。Safari/localhost制限は前回T139証跡を参照し再試行しない。
 - コピー内 `NODE_BIN=/opt/homebrew/bin/node ./scripts/run src/cli.ts produce render production-demo-ebf84adc --renderer native --resolution 720 --subtitles both`: 終了0、8.286秒、新規72秒MP4（`evidence/native-short-render.txt`）。長尺 `production-demo-110ed262` 同条件: 終了0、34.381秒、604秒MP4（`native-long-render.txt`）。どちらも承認済み合成デモからの新規ジョブ。
 - 独立ffprobeはRemotion package内ffprobeへ同梱dylibの `DYLD_LIBRARY_PATH` を設定して実行し、短尺はH.264 1280×720/24fps/72秒/1,728 frame、AAC 24kHz mono、mov_text。長尺は同codec/604秒/14,496 frame、AAC、mov_text。短尺/長尺ともFFmpeg `-xerror` の映像+音声全デコードは終了0。JSON証跡は `native-short-independent.json` と `native-long-independent.json`。
 - 長尺音声はmock-audio-checkで14,496,000 samples/24kHz/604秒、41cue。VTT/音声cueのずれ0秒、MP4から抽出したmov_text 41cueはVTTと同時刻（`subtitle-sync-and-output-protection.json`）。代表PNGは5/36/68秒・5/302/598秒を目視。証跡 `evidence/frames/`。native renderer自身のmedia-checkは21 frameの抽出/レイアウト検査も記録。
 - `swiftc scripts/verify-avplayer-playback.swift -o /private/tmp/t139-avplayer-verifier`: 終了0。実行した短尺rate4はreadyToPlay/72秒/進行350観測/ended=true/18.2秒、長尺rate8はreadyToPlay/604秒/進行1467観測/ended=true/75.7秒。`avplayer-short.json`/`avplayer-long.json`、ソース複製は同evidence。
 - `git diff --check -- README.md docs/SPEC.md docs/STATUS.md tickets/T139.md .agents/skills/sample-render-verification/SKILL.md scripts/verify-avplayer-playback.swift`: 終了0（`diff-check.txt`）。終了前の `./scripts/run src/cli.ts check` はこの作業回がopenのため未実行。finish後に実行する。
- `./scripts/agentctl status T139 --require-metered`: 終了2「実行がない: T139」（`token-monitor.txt`）。この継続作業はagentctl管理実行ではないため使用量は取得不能、計測済みとは扱わない。推測値は記録しない。
- `./scripts/run src/worklog-cli.ts finish logs/2026-10-14/150813-T139-9c433f67 --status completed`: 初回終了1「T139: ブロック理由と再開不足」。ticketの必須見出しが不足していたため、残るRemotion固有制約と再開条件を同見出しで追記し、finish/checkを再実行する。

## 未実施・制約
Remotion固有のChromeレンダリング、ブラウザー内のtextTracks/UI/字幕選択、スピーカー試聴、自然TTS/人の声質評価は未実施。Remotion用Chromeはローカル簡易HTMLでも起動せず、Remotion経路の正常性は未確認。AVPlayer検査は無音かつrate4/8の高速全編再生で、実時間視聴や音質評価ではない。実API・認証・課金・YouTube投稿・pushなし。モデルルーター補助文脈では現在モデルがgpt-6-lunaと提示されたが、別管理実行ID/使用量は存在せず未計測。

## TODO・再開方法
このticketの実MP4・全デコード・字幕同期・代表フレーム・実プレイヤー受入条件はnative経路で充足しdone。Remotion指定の再検証が必要になった場合はChrome Headless Shellが起動できる環境で新しいT139作業回を開始し、Remotion短尺を独立検査してから長尺を実行する。ブラウザーUI固有の確認はlocalhost/browser操作可能環境で行う。今回追加した `scripts/verify-avplayer-playback.swift` とSkill fallbackは再利用できる。
