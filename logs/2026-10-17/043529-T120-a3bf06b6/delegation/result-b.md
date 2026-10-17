# 音声・長尺の実媒体 再監査（T125 / T127 / T138 / T139）

ファイルは変更していません。`checkSubtitleSync` の NaN 入力は、スクラッチパッドの一時スクリプトで再現しました。リポジトリ内の試験は再実行していません。

## T125　判定: 問題なし

- `src/narration.ts` の `validateNarrationMetadata` と `validateEvaluation` は、評価値を 1〜5 の整数に限定しています。評価者名と `reviewedAt` も必須で、欠測は例外になります。
- `src/orchestration-pipeline.ts:182-189` の `attachNarrationMetadata` が、台本 hash の不一致を拒否します。
- チケットは「サンプル音声で検査が成功する」ことを要求していますが、これは評価票の形式検査にとどまります。自然さの合否は人の記録に委ねる設計で、チケットの対象外記載と一致しています。実害はありません。

## T127　判定: 要修正（2件）と軽微（2件）

### 要修正 1: 字幕同期検査が NaN を合格にする

- **(a) 主張:** `checkSubtitleSync` が音声長と字幕 cue のずれを機械検査する。
- **(b) 実際:**
  - `src/audio-pipeline.ts:133` は `actualDurationSec ?? 0` で、欠測（`undefined`）は 0 に落とします。しかし NaN は `??` を通過します。
  - 142 行目の `drift > toleranceSec` は NaN だと false になります。
  - 戻り値の `ok` は `errors.length === 0` だけで決まります。
- **(c) 影響:** 接続が `durationSec: NaN` を返すと、同期合格のまま `totalActualDuration` と `driftSec` が NaN で記録されます。
  - `synthesizeLongFormAudio`（同 94-97 行）は、接続の返す `durationSec` を有限値かどうか検査せず代入します。
  - sayの`LocalSayAudio` 経路は `Number.isFinite` で別に守られています。
  - 接続抽象を使う経路には防御がありません。
- **(d) 再現:** 2 cue の plan で `s[0].actualDurationSec = NaN; s[1].actualDurationSec = 2` として `checkSubtitleSync(plan, s)` を呼びます。結果は `{"ok":true,"totalActualDuration":null,"driftSec":null,"errors":[]}` でした。
- **(e) 確度:** 確認済み。ただし現在の本番経路は say と mock が有限値しか返さないため、到達可能性は接続追加時の話です。

### 要修正 2: 制作経路に同期検査と音量検査がつながっていない

- **(a) 主張:** 「音声長・字幕cue・場面タイミングのずれを機械検査」「YouTube規格 -14 LUFS ±1 / TP ≤ -1 の音量検査」。
- **(b) 実際:**
  - `checkSubtitleSync` と `checkAudioLoudness` の呼出元は `src/mock-audio-media.ts:104,154` だけです。`rg` で `src/commands/` と制作経路に呼出しがないことを確認しました。
  - `src/media.ts:138` の `encode` は音量を記録するだけで、`target: '未設定（ナレーション接続時に決める）'` です。
  - `src/media.ts:122` のナレーション検査は次の 2 点だけです。
    - 全体のピークが 0 でなく、かつクリップしていないこと。
    - 全体の長さが ±0.1 秒に収まること。
  - `src/media.ts:129` の各場面冒頭 0.7 秒の確認も、ピークが非ゼロであることだけを見ます。
  - `src/local-say-audio.ts:213-229` は cue の末尾を無音で埋めて合計を台本尺に揃えます。このため尺の検査は構成上いつも通ります。
  - `src/local-say-audio.ts:160-162` は PCM が非空かどうかしか見ず、無音かどうかは見ません。
- **(c) 影響:**
  - `--audio say` では、場面冒頭以外の cue が無音でも検出されません。LUFS が -30 や -5 でも合格します。
  - voicevox 側にだけ `-30〜-10` の広い音量ゲートがあります（`src/voicevox-audio.ts:124`）。
- **(d) 根拠:** 上記の呼出し元の `rg` 結果と `media.ts` の該当行。
- **(e) 確度:** 確認済み。T127 の受入条件は「検査できる工程を作る」ため、モジュールの存在自体は充足しています。ただし、結果欄の「検査」は本番ナレーションの合否を決めていません。

### 軽微 1: 「結合」の主張

- `synthesizeLongFormAudio` は結合をしておらず、接続が返す `durationSec` を合計するだけです。
- 試験（`tests/audio-pipeline.test.ts`）は固定の `durationSec: 30` を返す `MockConnection` を使っています。測定した音声ではありません。
- 実際の結合は T138 の mock 経路で行われます。

### 軽微 2: 同期検査の許容誤差

- `checkSubtitleSync` は累積ずれだけを許容 0.5 秒で見ます。cue の終端が揃っていれば、cue 内の発話ずれは検出できません。
- 実害は確認していません。

## T138　判定: 軽微

- 実測は実際に行われています。
  - `src/mock-audio-media.ts:72-76` で WAV を全デコードし、PCM の最後尾から tone/無音の境界を検出しています。
  - ダッキングは、BGM stem と最終ミックスの 220Hz 成分の両方で測定しています（100 行目付近）。
  - LUFS と True Peak は ebur128 の出力を正規表現で読んでいます（133-139 行）。固定値ではありません。
  - 欠測は `Missing loudness measurements` で例外、無音とクリップは `Silent or clipped mix` で例外になります。
  - 失敗時は staging を削除して既存結果を保護します。この点は試験で確認されています。

### 軽微 1: 音量の合否が成否に影響しない

- **(a) 主張:** 「字幕同期・音量検査を実媒体から検証」。
- **(b) 実際:**
  - `src/mock-audio-media.ts:154` は `checkAudioLoudness` の結果を report に入れるだけです。`passed:false` でも例外にならず、成功を返します。`loudnessPolicy` に「記録のみ」とあります。
  - 試験 `tests/mock-audio-media.test.ts:31-32` が確認するのは、LUFS が有限であることと `truePeak < -1` だけです。`loudness.passed` は確認していません。
- **(c) 影響:** 結果欄の「検査」は、実測した値を記録する意味にとどまります。文書には記録のみと書かれているため、乖離は小さいです。

### 軽微 2: 同期検査の比較対象が自作の値

- 素材は期待尺どおりに自分で生成した WAV です。cue 同期のずれは構成上 0 になり、試験が検出力を示してはいません。
- 負の試験は、尺が合わない plan の拒否（`tests/mock-audio-media.test.ts`）と ffmpeg 失敗の注入だけです。
- 無音やクリップの注入試験はありません。
- チケットが模擬であることを明記しているため、記載との乖離は小さいです。

## T139　判定: 軽微

- 記載どおりの証跡が `logs/2026-10-14/150813-T139-9c433f67/evidence/` にあります。
  - 長尺の独立検査 JSON（`native-long-independent.json`）には、ffprobe の `nb_read_frames: 14496` と全デコード成功があります。
  - 代表フレーム PNG 6 枚と AVPlayer の実行結果（`avplayer-long.json`）があります。
- `scripts/verify-avplayer-playback.swift` は証跡内のコピーと diff で一致しました。
- 失敗した 10-13 の Remotion 試行も、別ログに分けて残されています。
- Remotion が失敗扱いだった点も、チケットに正直に書かれています。

### 軽微 1: 字幕同期の証跡が追えない

- **(a) 主張:** 「41 cue すべての開始/終了が一致（最大ずれ 0 秒）、MP4 字幕抽出は VTT と一致」。
- **(b) 実際:**
  - 根拠の `subtitle-sync-and-output-protection.json` は、要約値（`maxCueDriftSeconds: 0.0` など）だけです。cue ごとの比較データやコマンドが付いていません。
  - 比較対象の「音声 cue」は、台本から生成した合成トーンの位置です。実音声から測定した位置ではありません。
  - 焼き込み字幕の表示タイミングは、代表 3 フレームの目視だけです。
- **(c) 影響:** 「ずれ 0 秒」を第三者が証跡から再検証できません。
- **(e) 確度:** 確認済み。

### 軽微 2: PSNR が NaN のときの扱い

- **(a) 主張:** 実 MP4 の媒体検査が、欠測では合格にならない。
- **(b) 実際:** `src/media.ts:72` は `Number.isNaN(db) ? Infinity : db` で、PSNR が測れなかったフレームを Infinity（合格）に倒します。
- **(c) 影響:** ffmpeg が成功したのに `average:` 行がない場合は、欠測が合格になります。通常は ffmpeg が異常終了して例外になるため、到達は稀です。
- **(e) 確度:** 仮説（コード上の根拠のみで、再現はしていません）。T044/T139 の実測は PSNR 閾値を通過しています。

## 要約

1. 要修正は T127 の 2 件です。NaN の音声長が同期検査を通ること（再現済み）と、同期・音量検査が `sample`/`produce` の本番ナレーション経路に接続されていないことです。
2. T125 は問題なし、T138 と T139 は軽微です。T138 の実測（LUFS・True Peak・ダッキング）は実測値で、欠測は例外になります。T139 の長尺実 MP4 の証跡も実在します。
3. 残る弱点は、同期検査の入力が自作の合成トーンであること（T138 は設計上、T139 は証跡の粒度）と、音量の合否が成否に影響しないことです。