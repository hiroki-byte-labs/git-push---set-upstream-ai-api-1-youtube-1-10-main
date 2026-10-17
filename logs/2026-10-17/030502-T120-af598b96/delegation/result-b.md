# T167 / T169 / T173 の抜き取り再監査

読取専用で監査しました。一時コピーでの再現は scratchpad 内だけで行っています。`tests/thumbnails.test.ts` と `tests/serve-thumbnail.test.ts` は 12 件とも合格しました。

## T167（status: review。本人確認待ち）
**判定: 要修正。** 実害は「実測」という表記だけです。受入条件の欠落は status が review のため、虚偽の done にはなっていません。

1. **コントラスト比「全件 18.46」は実画素の測定ではありません。**
   - (a) 主張は、チケット結果欄と `docs/T167-THUMBNAIL-REVIEW-PACKAGE.md:16-40` の「コントラスト比」「実測一覧」です。HTML も「コントラスト比 18.46 : 1」と載せています。
   - (b) 実際は `scripts/render-thumbnail.swift:421-423` の `contrastRatio(bgColor, textColor)` です。これは設計上の背景色と文字色の理論値で、PNG の画素は読んでいません。全 9 案が同じ配色なので同じ値になります。`scripts/generate-thumbnail-review-package.ts:119,179` はそのレポート値をそのまま出力しています。
   - (c) 背景画像やモチーフの上に文字が載った実際の見え方は、この数値に反映されません。レビュー文書の「実測」ラベルを本人が信じるおそれがあります。
   - (d) 確認済みです。画素由来のコントラストは T173 の `measureScaledLegibility`（13〜14 台）で、18.46 とは別の値です。`work/thumbnail-evaluation-package` のコピーに `checkThumbnailQuality` を実行すると、画素測定は a 案で 13.02、14.65 などになりました。
   - (e) 確認済み。

2. **「全件PASS」は検査結果を転記しただけで、T173 より前の基準です。**
   - (a) 主張は、全件 PASS（品質検査合格）です。
   - (b) `scripts/generate-thumbnail-review-package.ts:57` は `checkThumbnailQuality` を呼びますが、戻り値 `quality` をどこにも使いません。PASS / FAIL は swift が出す `rep.ok` を転記しています（同 :179）。
   - (c) 縮小視認性、PNG 寸法、brief 照合、needs-review といった厳格検査の結果が文書に出ません。`quality` が不合格でも文書は PASS になり得ます。
   - (d) コードの根拠は確認済みです（`quality` の参照が 0 件）。実データでは `checkThumbnailQuality` も 3 題材 9 案すべて pass だったので、現時点で誤表示にはなっていません。
   - (e) 確認済み。

3. **受入条件のうち未提示のものがあります。**
   - (a) 主張は、受入条件の「根拠場面・素材権利根拠・入力/出力 hash」の提示、「native/Remotion 両経路での意味と文言の一致」、「通常制作の承認・差戻し・失効の検証」、「異常時に承認候補へ進まないことと既存 outputs 不変の記録」です。
   - (b) 文書にあるのは brief の input hash だけです（出力 hash、根拠場面、素材権利の列はありません）。`tests/thumbnail-e2e.test.ts:19-58` が検証するのは、9 案の生成、寸法 1280x720、`checkThumbnailQuality` が ok であることだけです。Remotion 経路、承認・失効、意味一致は検証していません。
   - (c) チケットは「提出だけなので review」と明記しているので、虚偽の done ではありません。ただし結果欄の「E2E で…品質検査契約合致を検証」は、受入条件の網羅と読まれかねません。
   - (e) 確認済み。

## T169（status: done）
**判定: 軽微。** 承認失効、CSRF、ローカル限定は主張どおりです。

- **承認失効との結び付きは確認済みです。** `src/review.ts:59` が `selectedThumbnail` を bundleHash に含めます。`tests/serve-thumbnail.test.ts:149-173` が、切替後に `expired` になり、新ハッシュで承認できることを実際に検証しています。
- **ローカル以外から叩けないことも確認済みです。** `serve.ts:261` は `127.0.0.1` で listen します。`serve.ts:161-165` の `trustedPost` が Host を許可リストで、Origin を許可リストまたは未設定かで検査します。`Origin: null` は拒否されます。
- **軽微: `reviseThumbnail`（`src/metadata.ts:158-171`）が、選択先のファイルの存在と品質合否を確認しません。**
  - (a) 主張は、切替後に新版で承認できることです。
  - (b) 名前の正規表現と reason の空チェックだけで、`metadata.json` を書き換えます。
  - (c) 品質検査に不合格の案や欠落した案にも切り替わり、そのまま失効（expired）します。承認時には `src/review.ts:166-181` が拒否するので、承認を通ってしまう害はありません。UI 上は「切替成功→承認で 409」になるだけです。
  - (d) コード上の根拠で、確度は確認済みです。
  - (e) `job.thumbnailQuality.canProceed` は `src/commands/sample.ts:242` が a 案固定で算出しています。b 案へ切り替えると、a 案の合否が b 案の承認可否に混ざります。a 案が不合格で b 案が合格でも承認できません（安全側の誤り）。これはコード上の推測で、再現は未実施です。

## T173（status: done）
**判定: 要修正（1件）。**

1. **縮小 PNG が無いと検査がスキップされ、そのまま合格になります。**
   - (a) 主張は、縮小画像があれば自動測定し、不合格なら安全停止、というゲートです。
   - (b) `src/thumbnails.ts:358-372` は `-160.png` も `-320.png` も存在しないと、測定せず issues も追加しません。縮小画像は swift が `sips` で作りますが、起動失敗は `try?` で握りつぶされます（`render-thumbnail.swift:448-457`）。
   - (c) `sips` が失敗しても、縮小済みファイルを消しても、`checkThumbnailQuality` は ok=true / canProceed=true を返します。T173 のゲートが欠測で通過します。
   - (d) 再現済みです。`work/thumbnail-evaluation-package` のコピーで superstar の `-160.png` と `-320.png` を削除して `checkThumbnailQuality` を実行すると、3 案とも `pass`、`scaledLegibility=null`、reasons は空でした。
   - (e) 確認済み。
   - 同じ関数の `readFileSync` と `decodePngRgba` の失敗は issues に積まれます。この穴は「ファイルが無い」場合だけです。

2. **縮小画像の寸法を検証しません。**
   - (b) `measureScaledLegibility` は、渡された PNG の幅から scale を逆算するだけです。
   - (c) 縮小のつもりのファイルが原寸でも、そのまま測定して合格します。
   - (d) 再現済みです。`thumbnail-a.png`（原寸）を `thumbnail-a-160.png` としてコピーすると、a 案は `scaledLegibility` が [18.46, 1.853, 1] で pass になりました。縮小の取り違えを検出できません。
   - (e) 確認済み。

3. **実 PNG を縮小して測っているか → 実画素です。**
   - `decodePngRgba` で `sips` 出力の実ファイルをデコードし、`drawnBox` の領域で輝度の 5% / 95% 点と Sobel エッジを計算しています。固定値ではありません。
   - `thumbnails-report.json` への追記も一時コピーで確認できました（`scaledLegibility` が 3 件）。
   - ただし `work/thumbnail-evaluation-package` のレポートには T173 以前の生成物のため `scaledLegibility` がありません。T167 の成果物に T173 の指標は載っていません（軽微）。

## 要約
- T173 は縮小 PNG の欠測や取り違えをそのまま合格にする穴があり、要修正です。測定自体は実画素です。
- T167 の「コントラスト 18.46・全件PASS」は、設計色の理論値と swift レポートの転記で、画素の実測ではありません。表記訂正が必要です。
- T169 は承認失効とローカル限定を実装・試験で確認できました。切替先の存在と品質を事前確認しない点が軽微に残ります。