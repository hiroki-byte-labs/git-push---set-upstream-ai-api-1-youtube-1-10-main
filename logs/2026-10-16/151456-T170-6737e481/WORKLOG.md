# 作業記録 T170
- 記録者・実施者: Codex
- モデル: gpt-6.1-sol (runtime)
- 開始日時: 2026-10-16T15:14:56.104Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T170修正: cue超過時の音声切り捨てを回帰試験で再現し、安全停止・PCM保存・端数サンプル境界を修正。隔離した実音声/MP4で検証する

## 実施内容・変更ファイル
src/local-say-audio.tsのcue超過を検出し、切り詰めから安全停止へ変更。端数境界を絶対サンプル時刻で計算し、全PCMを保存する。say出力形式の検査とテスト用の合成境界注入を追加。tests/local-say-audio.test.tsに実発話超過と分数境界の回帰試験を追加し、docs/SAY-AUDIO-TIMING.md、T170/STATUSを更新した。

## 判断と理由
承認後に尺を自動変更すると字幕・映像と承認版がずれるため、超過時は失敗とし新版の台本・再承認へ案内する。短い発話は残りを無音で埋め、合成されたサンプルを失わない。
routine-to-skill評価: T179の超過拒否とT170の切捨て再現により、総尺/全デコードだけでは音声欠落を検出できないという反復根拠がある。既存sample-render-verificationにcue実PCM照合を追加し、今回の回帰/隔離試験へ適用。また初回隔離import不足の実績からassets/motion-labソースをコピー対象に明記。新規Skillは作らない。closeout/token-monitorも適用した。

## 検証コマンド・結果・証跡
開始check/next成功。実音声超過試験は修正前にMissing expected rejectionで終了1（evidence/before-fix.txt）。修正後の対象7/7成功（after-fix.txt）、全体411/411成功（all-tests.txt）、型検査終了0（typecheck.txt）。隔離初回はmotion-lab/src/remotion-plan.ts不足で終了1（render.txt）。同ソースをコピーして再実行は48秒/1152frame実MP4生成成功（render-second.txt）。独立FFmpeg全decode終了0（decode.txt）、3フレーム目視（frames.png）、AVPlayer1x/48秒/942進行/ended=true/終了0（playback.txt）。job/media-checkの実測値をevidenceへ保存。元outputs全件の集合・サイズ・mtime・SHA-256一致（outputs-preserved.txt、開始manifestはoutputs-before.json）。agentctl status tsk_0mvb3yzm0690f09af0d54 --require-metered はmissing/終了4（metering.txt）。finish後checkを実行する。

## 未実施・制約
実再生はミュートAVPlayerであり、スピーカーでの実聴・声質採用・ブラウザーUI固有確認・Remotion固有再生成は未実施。元outputsの追加/整理、実API・課金・push/投稿なし。動画/WAVは隔離先に置きログへ保存していない。対話計測は未完了。

## TODO・再開方法
T170の対象不具合は修正/実生成検証済み。超過した本番台本はdocs/SAY-AUDIO-TIMING.mdに従って下書きを調整し、事実確認・本人再承認する。次は別作業回でT171の未確認URL自動verifiedと旧レポート流用、CLI/HTTP承認経路を修正する。
