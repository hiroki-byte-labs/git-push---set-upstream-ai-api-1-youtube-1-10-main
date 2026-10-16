# T138: 合成トーンによる実音声媒体検査

`src/mock-audio-media-cli.ts` は独立したmock経路です。TTS、声の読み上げ、外部API、本人の試聴評価はありません。台本のcueごとに24kHz/mono/16bit WAVを生成し、先頭60%を合成トーン、残り40%を無音にします。合成BGMは220Hzの正弦波です。自然なナレーションや実サービスの接続成功を意味しません。

```sh
T138_TEMP=$(mktemp -d /tmp/T138-media-XXXXXX)
./scripts/run src/mock-audio-media-cli.ts fixtures/sample-general.json "$T138_TEMP"
```

既存の一時フォルダ（OSのtmpdirまたは/tmpの下、リポジトリ外）を指定してください。結果はその中の新しい `audio/` に置きます。既存の `audio/` は拒否します。既存outputs、sample、制作ジョブは操作しません。APIは `renderMockAudioMedia(plan, isolatedRoot)` です。

- FFmpeg concatで複数WAVを結合し、各スライスと結合結果を `-xerror` 付きで再デコードします。
- 実PCMのサンプル数、cue境界の累積ずれ、トーンの開始/終了を検査します。同期許容は2サンプルです。字幕の画面表示、発音と文字の意味の一致は検証しません。
- T127のダッキング計算に実PCMから得たトーン/無音区間を渡します。BGMを通常-18dB、トーン中-28dBにし、FFmpeg aevalでサンプル単位の減衰を適用してamixで結合します。
- BGM単体のRMSと、最終ミックスの220Hz成分の両方を再デコードPCMから測定します。区間内の10dB減衰（許容±0.5dB）を必須とします。220Hz成分の分離は既知の合成トーン専用の100ms窓です。
- ebur128で統合LUFS/True Peakを実測し、PCMピーク・総サンプル数も記録します。T127の音量目標に対する `loudness.passed` を保存しますが、mockの目的は処理経路の検査なので目標への正規化は行いません。音量目標未達を実ナレーションの合格と報告しないでください。

`audio/media-check.json` にmock表示、FFmpeg版、cue境界、検出トーン時刻、音量、各処理コマンドと終了コードが入ります。WAV/PCMは隔離フォルダに保持し、作業ログの証跡へコピーするのはJSONとテキストログだけです。失敗時は未完成のステージフォルダを削除し、既存ファイルを保持します。

検証: `./scripts/run --test tests/mock-audio-media.test.ts tests/audio-pipeline.test.ts`。最短0.5秒cue、実測の同期と減衰、公開済み結果の保護、ミックス段階の終了17の障害注入と再実行、リポジトリ出力の拒否を含みます。
