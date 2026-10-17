# T160〜T176 抜き取り再監査の照合結果（親による確認）
子3件（claude-sonnet-5-5、agentctl run、read_only）の報告は delegation/result-{a,b,c}.md。以下は親がコード・最小再現で確かめた判定。

| チケット | 判定 | 親の確認 |
|---|---|---|
| T160/T161/T162/T168 | 問題なし | 子の報告のみ（親は未精査） |
| T163 | 軽微 | swiftのcontrastは設計色の理論値（render-thumbnail.swift:421-423）。子の報告、親は行のみ確認 |
| T164 | 軽微 | 接続は成立。試験は文字列検査で sample.ts の回帰を検出しない |
| T165 | 要修正 | 確認済み: checkThumbnails は swift の ok/issues を読まない（衝突・補足はみ出しが合格）。briefとの文言照合なし。原寸PNGはヘッダーのみ |
| T166 | 要修正 | 確認済み: job.thumbnails は {file,ok,issues} で画像hashを持たず、recordReview は記録値だけで判定。制作後の画像差替えを古い合格で承認できる。metadataなしでガード全体を飛ばす |
| T167 | 表記訂正 | 「実測コントラスト18.46」は理論値、PASSはswiftのok転記。statusはreviewのまま |
| T169 | 軽微 | 失効・ローカル限定は確認。切替先の存在・品質を事前確認しない（承認時には拒否） |
| T172 | 要修正 | 確認済み: createQueueExecutor の sample 経路は job.inputs を使わず今回の defaultOpts で drain する（別ジョブを今回の台本で描画して completed）。同一案件の再描画がID重複/stageで拒否 |
| T173 | 要修正 | 確認済み: 縮小PNGが無いと測定も issue もなく合格。縮小画像の寸法検証なし |
| T174 | 要修正 | 確認済み: splitCues が改行を保持し、改行入りの考察で cue に "\n\n" が残る（VTTの空行=cue終端で壊れる）。optimizeSubtitleLines は再エクスポートのみで制作経路に未接続 |

修正順（誤成果・誤承認を先）: T174 → T172 → T165 → T173 → T166 → T167文書。
