# 抜き取り再監査: T172 / T174 / T168

ファイルは変更していません。再現は `tmp` 配下のスクリプトで行いました。`./scripts/run src/cli.ts check` は「未終了作業: 030502-T120」で止まりましたが、これは親作業回が開いているためです。

## T172(キュー接続): **要修正**

未承認の制作案件は、キュー経由でも拒否されます。キュー投入前に `assertRenderable` が走り(`src/commands/produce.ts:107`)、`enqueueProduction` でも `assertRenderable` と `assessStagePrerequisites` を検査します(`src/local-queue.ts:136-141`)。実行直前と実行後にも `verify` が再検査します。直接実行より緩い検査はなく、迂回は見つかりませんでした。

実行失敗は `failed` として記録され、`runSampleWithQueue` と `runProduceRenderWithQueue` が例外にします(`src/queue-adapter.ts:110`、`:140`)。ただし次の乖離があります。

### 1. 先に積まれた別ジョブが、今回の呼び出しの設定で実行される(要修正)
- (a) 主張: キューが各ジョブを管理し、順次実行する。
- (b) 実際: `createQueueExecutor` の sample 経路は、ジョブの `inputs[0]`(登録済みの台本)を使わず、今回の呼び出しの `defaultOpts` で実行します(`src/queue-adapter.ts:68-71`)。`drain` はキュー内の全 queued ジョブを実行します。
- (c) 影響:
  - 同じ `--queue-dir` に未処理の別 sample ジョブがあると、その台本ではなく今回の台本・字幕・解像度で描画されます。
  - 登録時の入力ハッシュ検証は通るため、「台本Aのジョブ」が台本Bの動画で `completed` と記録されます。
  - 並行して別プロセスが同じキューを使うとき、オプション取り違えが起きます。
- (d) 再現: scratchpad の `r1.ts`。`q2` に `fixtures/sample.json` のジョブを先に登録し、`fixtures/draft-price-index.json` で `runSampleWithQueue` を呼びました。runner は2回とも `draft-price-index.json` で呼ばれました(出力 `plans run [draft, draft]`)。
- (e) 確度: 確認済み。

### 2. 同じ制作案件は、キューから二度と描画できない(要修正)
- (a) 主張: `produce render <id> --queue` が `produce render` と同様に使える。
- (b) 実際:
  - ジョブIDに案件IDをそのまま使い(`src/queue-adapter.ts:55`)、IDの重複は拒否されます(`src/local-queue.ts:117`)。
  - 完了後は `currentStage` が `video-review` になるため、`currentStage !== 'render'` でも拒否されます(`src/local-queue.ts:141`、`src/production.ts:240`)。
  - 直接実行は `assertRenderable` だけなので、再描画できます。
- (c) 影響:
  - 一度完了した案件を、却下や台本更新後にキューで再描画できません。
  - 失敗した案件も、`failed` のジョブが残るため同じキューに再投入できません。
  - 回避は別の `--queue-dir` を使うか、キュー削除しかありません。
- (d) 再現: `r1.ts` で、1回目は `job1` で完了し、2回目は `Error: production is waiting for human review` でした。
- (e) 確度: 確認済み。

### 3. 試験が「失敗を記録」の主張を接続部では検証していない(軽微)
- (a) 主張: 受入条件「中断・異常終了時に receipt から復旧または失敗記録」。結果欄の6件目の試験。
- (b) 実際:
  - テスト6は `LocalQueue` を直接使っており(`tests/queue-adapter.test.ts` 末尾)、アダプターの失敗伝播は検証していません。
  - sample と produce の両方で runner を差し替えているため、`sample()` 本体は通りません。
  - 中断復旧(`recover`)のテストは、本ファイルにも `tests/local-queue.test.ts` の接続側にもありません。復旧は T141 の既存実装に依存します。
- (c) 影響: コードを読む限り失敗は `failed` になりますが、接続部の回帰は検知されません。
- (e) 確度: 確認済み(テストの範囲として)。

### 4. その他(軽微)
`src/cli.ts:21` の usage に `--queue-dir` と `--concurrency` がなく、`--audio` も `voicevox` が抜けています。

## T174(字幕分割): **要修正**

### 1. 改行・空白を含む考察で、cue本文に `\n` が残り、VTTが壊れる(要修正)
- (a) 主張: cue時刻・総尺を壊さず、元の文字を保持する。
- (b) 実際:
  - 旧 `splitCues` は先頭で `text.replace(/\s*\n\s*/g,'')` と `trim` を行っていました(`git show fd74c24^:src/production.ts` 136-139行)。
  - 新 `splitSmartCues` は空白・改行を保持します。55字以内なら元の文字列をそのまま返します(`src/subtitle-optimizer.ts:~143`、`src/production.ts:139`)。
  - `injectReflection` は `narration` からだけ改行を除きます(`src/production.ts:160`)。cue には `\n` が残ります。
- (c) 影響:
  - `produce reflection --file` で段落区切りのある考察を入れると、cue に `\n\n` が入ります。
  - `buildVtt`(`src/commands/sample.ts`)が「タイムスタンプ行 → 空行 → 本文」を出力し、本文が別ブロック扱いになってVTTが不正になります。
  - 焼き込み字幕とも不一致になります。cue は改行入り、narration は改行なしで、`validate` と `lint` は通ります。
  - ソフト字幕や YouTube アップロード用 VTT で、先頭の空cueが生まれます。
- (d) 再現: `r2.ts` に、考察テキスト `…でした。\n\n次に…\n私は…` を入れて `injectReflection` と `buildVtt` を実行しました。2番目のcueが `"\n\n次に調べると…\n私は…"` になり、VTTは次のとおりです。

  ```
  00:00:04.500 --> 00:00:12.000\n\n\n次に…
  ```

  `loadPlan` と `lintPlan` は ok でした(検出なし)。
- (e) 確度: 確認済み。字幕テスト5件はいずれも改行入り入力を使っていません。

### 2. `optimizeSubtitleLines`(1行15〜22字の改行)が制作経路に接続されていない(要修正)
- (a) 主張: 「1行15〜22字に収まるよう文節・助詞境界で `\n` を挿入」し、`BurnInSubtitle.tsx` の `pre-line` で2行表示する。
- (b) 実際: `optimizeSubtitleLines` の呼び出しは `src/plan.ts:310` の再エクスポートとテストだけです。`src/`・`motion-lab/src`・`scripts/` のどこにもありません。`splitSmartCues` だけが `production.ts` と `documentary.ts` に接続されています。
- (c) 影響: 受入条件の「1行15〜22字の改行」は実際の動画に一切効きません。`pre-line` の追加も、改行が入らないので何も起こりません。native 描画(Swift)にも接続はありません。
- (e) 確度: 確認済み(grep)。

### 3. 試験が主張を検証していない(軽微)
- (a) 主張: 「文節の途中で泣き別れが排除される」。
- (b) 実際:
  - 検証は固定の2〜3文に対する先頭文字の正規表現 `^[はがをにへとでものや]` だけです。
  - 長い無区切り文は `chars(rem) > max` で max 字ちょうどに強制分割され、語の途中で切れます(`src/subtitle-optimizer.ts:~150`)。これは試験でも「`あ`×120」で通すだけです。
  - cue 総尺・時刻との整合や、改行を含む入力はありません。
- (e) 確度: 確認済み。

### 問題なしの確認
- 文字の欠落: `join('')` の可逆性は保たれています(強制分割・末尾統合も `slice` 保存)。
- 時刻:
  - `injectReflection` は、最後のcueが `seconds - used` なので、合計は場面の尺と一致します。
  - 0.5秒未満になる場合は例外で止まります。
  - `documentary.ts:87-95` も同様で、尺を壊す経路は見つかりませんでした。

## T168(起票): **問題なし**

`tickets/T169〜T176` の8件が存在し、タイトル・優先度・M4(T176のみM0)・`depends` が本文の一覧と一致しています。`docs/STATUS.md:33` の記載も整合しています。`cli.ts check` は「OK: 155 tickets」でした。

軽微な点が1つあります。本文の「全145チケット」「本体370件」は起票時点の値で、現在は155件、T172/T174では383〜388件に増えています。時点差であり、誤りではありません。

## 全体の要約
1. T172は、未承認案件の拒否と失敗の `failed` 記録は実装どおりです。ただし、ほかのジョブをいまの設定で実行する取り違えと、同じ案件を再描画できない問題があります。
2. T174は、改行入りの考察でVTTが壊れる回帰があります(旧実装が除去していた改行を保持)。1行改行機能は未接続のデッドコードで、主要な受入条件が制作に効いていません。
3. T168は整合しています。