# 作業記録 T044
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
エンハンス一括実施のうちT044（字幕の焼き込み/ソフト選択と媒体検査の強化、候補6・8）。ローカル作業のみ

## 実施内容・変更ファイル
- src/media.ts（全面改訂。1文1行の書式にした）
  - 書出し: `-vf fps=24,tpad=stop_mode=clone:stop_duration=2 -frames:v <秒×24> -t <秒>`。soft/bothのときはsubtitles.vttを3番目の入力にし、mov_text（language=jpn）で多重化する。
  - 新しい関数: segmentsOf（startFrameを補う）、psnrTargets（最大120区間に間引く）、checkPsnr（区間の中央フレームとPNGのPSNRを比べ、30dB未満なら失敗）。
  - 検査の追加: videoFramesとexpectedFramesの一致、subtitleStreams（soft/bothなら1が必須）、PSNR、LUFSとtrue peak（記録のみ）。
  - media-check.jsonに上の項目を追加した。
  - ffのtimeoutを600秒、maxBufferを32MBに拡大した（長尺の検査に備えるため）。
- src/commands/sample.ts
  - --subtitles burn|soft|bothを追加した。NativeVisualが字幕モードを持つ。softのときは描画仕様のsubtitlesを'none'にする。
  - VTTを描画の前に書くよう変更した（多重化に使うため）。
  - job.jsonにsubtitlesを記録する。
- src/cli.ts: 使い方を更新した。
- tests/media.test.ts: フレーム数、PSNR、LUFSの確認を追加した。短い区間でもフレーム数が一致することとソフト字幕の多重化、PSNRの不一致を拒否することの試験を追加した。tests/plan.test.ts: --subtitlesの引数の試験。
- docs/VERIFICATION.md（フレーム数の節を追記）、docs/STATUS.md、tickets/T044.md（done）。

## 判断と理由
- **T043の記録の訂正**: T043のWORKLOGとチケットにある「21区間・1152フレーム」は区間計算の合計で、実際の動画はT043の書出し方式で1066フレーム（v1は777フレーム）だった。原因は、1秒未満の区間で`-r 24`の変換がフレームを落としていたこと。T043の時点ではフレーム数を検査しておらず、見逃した。閉じた過去ログは改変せず、ここで訂正する。修正は本チケットで行い、全モードで一致を確認した。
- fps＋tpad＋-frames:vの方式は、scratchpadで3方式を比べて選んだ（現行777、fpsフィルター＋frames 864、さらにtpad 864）。最終画像の長さが足りない場合にも備えてtpadを加えた。
- PSNRの基準30dBについて: 同一画像はH264後でも約39.6dB、黒画像への差し替えは大きく下回る。その中間で、別画像・黒画面・時刻ずれを検出できる値にした。
- LUFSに合否基準を設けなかった。確認音は模擬で、配信の目標値はナレーションの採用時（T028）に公式の推奨を調べて決めるため。
- Skill化の評価: 新しい定型手順はない。見送る。

## 検証コマンド・結果・証跡
証跡はevidence/に保存した。
- 修正前の実測: 7f46324e（M1当初）は863フレーム、3eac00aa（T043のv1）は777フレーム、75e1b521（T043のv2）は1066フレーム。
- 修正後のsample:
  - v1のburn（reflection-demo-591adf71）: 864/864、PSNR最小39.6dB（18区間すべて照合）、LUFS -24.3。
  - v2のburn（bias-check-demo-8cc5bf3e）: 1152/1152、PSNR最小39.6dB（21区間）。
  - v2のsoft（9233f7b6）: 1152/1152、字幕ストリーム1、PSNR最小39.7dB。
  - v2のboth（58b038aa）: 1152/1152、字幕ストリーム1、PSNR最小39.6dB。
- 目視: burn-vs-soft.png。左がboth（焼き込みあり）、右がsoft（字幕枠なし）で、同じ時刻の画面。
- `--test` → 67件成功。`tsc --noEmit` → エラー0。
- 途中の失敗: zshの`$args`が単語に分割されず、3回の実行が「不明な引数」で失敗した。個別に実行し直して成功した（コードの不具合ではない）。

## 未実施・制約
- ソフト字幕は、プレイヤーによっては表示されない（Chromeの<video>はmov_textを表示しない）。プレビューで<track>からVTTを読む対応はT033で行う。
- PSNRは区間の中央の1フレームだけを照合する。区間の切替時刻のずれ（1〜2フレーム）は検出できない。
- LUFSは記録のみで、合否判定はない。
- 長尺（20分）での検査時間は未測定。

## TODO・再開方法
- 次はT024の残件（接続抽象とBudgetを制作工程へ配線）。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T024`。
