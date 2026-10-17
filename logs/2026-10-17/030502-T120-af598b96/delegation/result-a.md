## 監査結果: サムネイル基盤 T160〜T166

読取専用で、ファイルは変更していません。再現は `scratchpad` 内で、実際の `renderThumbnails` で作った3枚を使いました。確認したのは、`src/thumbnails.ts` の `checkThumbnails` / `checkThumbnailQuality`、`src/review.ts`、`src/commands/sample.ts`、`scripts/render-thumbnail.swift`、関連 tests です。

### T160（brief契約）: 問題なし
検査範囲では、`sample.ts:223` で `buildThumbnailCandidates` が使われ、`thumbnail-brief.json` として保存・参照されています。

### T161（3候補構成）: 問題なし
こちらも `sample.ts:223` で接続されています。

### T162（モチーフ・素材台帳）: 問題なし（今回は深掘りせず）

### T163（専用PNG描画）: 軽微
- **(a) 主張**: 「実背景とのコントラスト」「全headline/sub/ラベルが実際に描かれ、はみ出し/衝突/欠字なら失敗」。
- **(b) 実際**:
  - `scripts/render-thumbnail.swift:422-423` のコントラスト比は、定数の `bgColor` と `textColor` から計算しています。描画後の画素は測っていません。モチーフが文字に重なっても値は変わりません。
  - `:202` の明背景判定は `composition=="scene" && headline.contains("差別")` です。見出しの語句で背景色が決まります。
  - ラベルの描画・検査は、swift 内の issues 追加箇所（`:380, 413, 416, 425, 440`）に見当たりません。
- **(c) 影響**: 実画素のコントラストや、ラベルの欠字は検出できません。
- **(d) 根拠**: 上記の行。
- **(e) 確度**: 確認済み（コード上）。

### T164（native/Remotion接続）: 軽微
- 接続自体は成立しています。`sample.ts:222-245` は動画rendererに依存せず `renderThumbnails` を呼び、`remotion-visual.ts:100` ではサムネイル抽出が外されています。
- **(a) 主張**: 「同一Planと素材からnative/Remotion両方が同じ専用3候補を出す」「隔離コピーで両rendererを実行し、PNG hashを照合」。
- **(b) 実際**: `tests/thumbnail-pipeline.test.ts` の2つ目の試験は、`generateRenderReport.toString()` に `"thumbnail-"` が含まれないことを見る文字列検査だけです。両rendererの実行比較はありません。1つ目の試験は `renderThumbnails` の直接呼出しで、`sample.ts` を通していません。
- **(c) 影響**: `sample.ts` の接続が壊れても試験は落ちません。
- **(e) 確度**: 確認済み（試験コード上）。結果欄に実レンダリングの証跡は見当たりませんでした。

### T165（実画像・全テキスト検査・欠測拒否）: 要修正
`checkThumbnailQuality` の構造的な不合格は拒否できています。ただし、主張の中核である欠測拒否と全テキスト検査には穴があります。

1. **swiftが出した `ok:false` と `issues` を無視する**
   - (a) 主張: 「未描画文字・衝突・素材権利・2MiB超を拒否」。
   - (b) 実際: `src/thumbnails.ts:270-334` の `checkThumbnails` は `headlineSize`、`fitted`、`contrast` と画像の有無・バイト数しか見ません。`r.ok` と `r.issues` は読みません。swift が issues にだけ積む「補足見出しが枠内に収まりません」（`render-thumbnail.swift:416`、`fitted` は true のまま）や「主見出しと補足見出しの描画領域が衝突」（`:413`）は、品質判定に届きません。
   - (c) 影響: 補足が描かれなくても、衝突していても、`canProceed:true` で `job.thumbnails[].ok:true` になります。承認や `publishReadiness` もすり抜けます。
   - (d) 再現: 実描画した3枚の report に `ok=false` と衝突・はみ出し・素材hash不一致の issues を書き込んで `checkThumbnailQuality(dir, brief)` を呼ぶと、`ok:true, canProceed:true, reasons:[]` が返りました。
   - (e) 確度: 確認済み。
2. **検査対象文字集合と brief の照合がない**
   - (a) 主張: 「検査対象文字集合とbriefが一致」「Brief（見出し・補足・ラベル）との照合」。
   - (b) 実際: brief との照合は候補idの存在と `needs-review` だけです（`thumbnails.ts:380-388`）。headline / sub / ラベルの文字列比較はなく、report に sub とラベルの欄自体がありません（`drawnBox` は主見出しのみ）。
   - (d) 再現: report の `headline` を「全然別の文言」に書き換えても `ok:true, canProceed:true` でした。
   - (e) 確認済み。
3. **縮小画像が無いと検査を省略して合格する**
   - (b) 実際: `thumbnails.ts:313-326` は、縮小PNGが無ければ視認性測定自体を行いません。issue も付きません。
   - (d) 再現: `-160.png` と `-320.png` を全削除しても `ok:true, canProceed:true` でした。
   - (c) 影響: T165 の「欠測を拒否」に反し、縮小の測定欠測が合格になります。
   - (e) 確認済み。
4. **「破損PNG」検出はヘッダーだけ**
   - (b) 実際: `checkThumbnailQuality` は `readPngDimensions`（`thumbnails.ts:365-370`）でヘッダーだけを見ます。完全デコードは縮小画像のみで、原寸は未実施です。
   - (d) 再現: 原寸 `thumbnail-a.png` を「IHDRまで正常＋以降は0埋め」に差し替えると `status:'pass'` でした（縮小画像が残っていても通ります）。
   - (e) 確認済み。
5. **記載と実装が不一致**
   - 結果欄の「素材権利状態（unverified/unknown拒否）」と「手動縮小目視要件（needs-review）」は、`src/thumbnails.ts` に該当処理がありません。`rg 'rights|unverified'` で0件でした。
   - `needs-review` になるのは brief の候補が `needs-review` のときだけです。縮小目視の未確認は pass になります。T165 の「未確認を合格へ変えない」に反します。
   - (e) 確認済み。
6. **検査関数がレポートを書き換え、失敗を握りつぶす**
   - `checkThumbnailQuality`（`thumbnails.ts:343-361`）は検査関数なのに `thumbnails-report.json` を上書きし、失敗は `catch {}` で黙殺します。副作用と握りつぶしですが、影響は小さめです。

### T166（承認ハッシュ・承認ガード）: 要修正
bundleHash に採用サムネイルと brief が入る点は満たしています。`review.ts:48,82` で `selectedThumbnail` と brief のSHA が入り、a→b や画像差替えでハッシュが変わります。試験もあります。

1. **品質結果はハッシュに入らず、承認時に再検査もしない**
   - (a) 主張: 「選択・画像・brief/素材・品質結果が一致するか検証」「画像1枚の差替え・素材変更で要再検査／失効」。
   - (b) 実際:
     - `recordReview`（`review.ts:156-175`）は `job.thumbnails` / `job.thumbnailQuality` の記録値だけで判定します。記録は `{file, ok, issues}` で、画像hashは持ちません（`sample.ts:243`）。
     - 制作後に採用画像を差し替えると、画面で出る新しい bundleHash では承認できてしまいます。再検査は走らず、古い `ok:true` が使われます。
     - 素材（`assets/thumbnail-originals/*`）の変更は、bundleHash にも承認にも入りません。brief のハッシュはあるが、描画に使った `assetHashes` は入りません。
   - (c) 影響: 検査後に差し替えた未検査画像を、検査済みとして承認・公開可と判定できます。
   - (e) 確度: 確認済み（コード上）。再現の実行まではしていません。
2. **metadata が無いと、サムネイルのガードを全部飛ばす**
   - `recordReview` は `if (bundle.metadata)`（`review.ts:156`）の中でだけサムネイルを検査します。`metadata.json` が無い承認対象は、サムネイル未検査でも承認できます。
   - 一方 `publishReadiness` は metadata が無くても検査記録を見るため、挙動が非対称です。
   - (e) 確認済み（コード上）。
3. **旧ジョブの検査記録の扱い**
   - 「旧ジョブは検査未実施を合格としない」とありますが、`review.ts:145-151,172` は `job.thumbnails` があれば検査済みとみなします。T165 以前の旧形式の `thumbnails` の形に依存します。
   - 旧形式に `ok` が付いていれば、旧検査（コントラスト・サイズ・fittedのみ）の結果が現行基準の合格として扱われます。
   - (e) 仮説（旧ジョブ実物は未確認）。

### 全体の要約
- 3行で言うと、T160・T161・T162 は問題なし、T163・T164 は軽微、T165・T166 は要修正です。
- T165 は、中核の「欠測拒否・全テキスト検査」が実装されていません。swift の issues・衝突・補足はみ出し、縮小画像欠落、brief との文言不一致、原寸の破損画像が、すべて `canProceed:true` になります。
- T166 は、承認ハッシュに採用・brief・画像は入っています。しかし品質結果は記録値の参照だけで、画像hashや素材hashに結び付かず、差替え後の再検査もありません。
- T164 の接続は成立しています。ただし、試験が文字列検査と直接呼出しなので、`sample.ts` の接続の回帰は検出できません。