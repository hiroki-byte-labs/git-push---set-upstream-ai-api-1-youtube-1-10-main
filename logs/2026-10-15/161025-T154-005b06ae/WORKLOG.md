# 作業記録 T154
- 記録者・実施者: Codex-root
- モデル: gpt-5.6-sol (runtime)
- 開始日時: 2026-10-15T16:10:25.625Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T154のburn/soft/bothおよび30fps実Remotion媒体検証を現在ホストの隔離コピーで引き継ぐ

## 実施内容・変更ファイル
- 最新ソースを `/private/tmp/T154-root-verify-k5s1XSxd` へ隔離複製し、24fpsのburn/soft/bothと30fps transitions=falseの4本を実Remotion生成した。
- 4本を独立ffprobe、全映像/音声デコード、境界PNG、mov_text packet、AVPlayer全編再生で検証した。
- `tickets/T154.md` をdoneへ更新し、`docs/STATUS.md` に追試結果とT155への引継ぎを記録した。動画本体はログへ保存せず、既存outputsは変更していない。

## 判断と理由
3字幕モードのstream構成と焼き込み有無、VTTと実subtitle packetの境界、最短cueの完全表示、delayed reveal、既出要素維持、transitions=falseの即時完成を実MP4で確認した。先行agentの24/30fps対象テストと実媒体結果が一致し、全受け入れ条件を満たすためdoneとした。

## 検証コマンド・結果・証跡
- 24fps burn/soft/both: 各20秒480frames。30fps burn transitions=false: 20秒600frames。4本とも媒体検査passed/fullDecode passed、独立probe/count_framesと全映像音声デコード終了0。`evidence/verification-summary.json`。
- burnはvideo/audio、soft/bothはvideo/audio/subtitle mov_text。soft/bothはVTT 30cueとpacket 30件、最大境界誤差約3.6e-15秒で1frame以内。`evidence/subtitle-vtt-packet-comparison.json`。
- 24fps frame 0/5/6/10/11/12で最短cueのfade/hold/切替を、26/27/28・62/63/64でrevealを確認。30fps transitions=false frame 33/34/35・78/79/80で境界から完成状態を確認。PNGは `evidence/*boundary*.png`。
- AVPlayerミュートrate 8で4本ともreadyToPlay、duration 20、進行51件、ended=true、終了0。`evidence/playback.txt`。確認音でナレーションではなく実聴なし。
- 実装agentctl `status --require-metered`: completed/measured、終了0。`evidence/agentctl-metering.txt`。

## 未実施・制約
localhost制約によりブラウザーUIで字幕トラックを手動切替する操作は未確認。実MP4のmov_text stream/packetとburn有無、AVPlayer再生は確認済み。自然音声と実聴、T155のlayout計測は未実施。

## TODO・再開方法
T154の残件なし。次は依存が解けたT155を別作業回で開始する。T156は実Remotion統合検証が別途blocked。

## 定型作業のSkill化評価
先行作業回で既存sample-render-verificationとrepository-task-closeoutが隔離生成・デコード・目視・実再生手順を覆うと評価済み。本追試に新しい反復手順はなく、Skill更新は行わない。
