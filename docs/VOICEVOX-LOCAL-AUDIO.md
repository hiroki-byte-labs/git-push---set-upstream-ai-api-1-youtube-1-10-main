# ローカルVOICEVOX音声（T179）

`sample` / `produce render` の `--audio voicevox` で選択する。既定の音声は変更しない。数値loopback HTTP（127.0.0.1または[::1]）だけを許し、リダイレクト・外部ホスト・有料APIへ送信しない。起動していない場合は明確に停止し、確認音への自動切替えはしない。

音声ライブラリの規約を確認した記録をJSONで用意し、`VOICEVOX_RIGHTS_FILE` に絶対パスを指定する。例のspeakerは自分のエンジンの `/speakers` で確認したIDへ変更する。以下は値の形を示す例で、特定音声の採用・利用許諾済みを意味しない。

```json
{
  "speaker": 0,
  "credit": "VOICEVOX:利用する音声名",
  "termsUrl": "https://voicevox.hiroshiba.jp/term/",
  "checkedAt": "2026-10-16",
  "commercialUseAllowed": true
}
```

ソフトウェア規約だけでなく選んだ音声ライブラリ固有の条件を確認し、termsUrlには確認した条件へのURLを記録する。生成物のcreditは `voicevox-attribution.txt` と動画の概要欄に保存され、metadataの版に含まれる。

```sh
export VOICEVOX_RIGHTS_FILE=/absolute/path/voice-rights.json
export VOICEVOX_ENDPOINT=http://127.0.0.1:50021
# 実試験はリポジトリの隔離コピーをcwdにして実行する
./scripts/run src/cli.ts sample --plan fixtures/sample-v2.json --audio voicevox
```

1cueずつaudio_query→synthesisを実行し、24kHz/mono/PCM16、0.4秒のポーズ設定を要求する。実WAVの長さから5.2〜5.8字/秒に収まるよう最大3回までspeedScaleを調整する（モーラ/秒とは異なる）。発話がcueの割当て秒数を超えたら切り詰めず停止するため、短尺fixtureでは先に台本尺の調整が必要な場合がある。ピッチを自動判定して低音声を採用する機能ではない。

`voicevox-report.json` は実PCMのRMS/peak/クリップ、FFmpegによるLUFS/True Peak、cueの実尺/話速/開始時刻/本文hashを記録する。音量ゲートは-30〜-10 LUFS、True Peak<=-1 dB、非無音/非クリッピング。これはT181の最終ミックス-14 LUFS基準とは別。自然さ・ノイズ感・低音の適性は `pending-human` のまま本人試聴へ渡す。合成トーンのテスト結果を日本語音声の合格へ読み替えない。

公式参照（2026-10-16確認）:

- [Engine API](https://voicevox.github.io/voicevox_engine/api/)
- [AudioQueryモデル](https://github.com/VOICEVOX/voicevox_engine/blob/master/voicevox_engine/model.py)
- [ソフトウェア規約](https://voicevox.hiroshiba.jp/term/)（音声ライブラリ個別条件とクレジットが必要）

現作業環境では127.0.0.1:50021に接続できず、VOICEVOXアプリ/Dockerも見つからなかった。アダプター/注入transport試験のみであり、実エンジン互換性・発音・実音声再生・低音の受入条件は未検証。T179はreviewとして残す。
