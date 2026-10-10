# 作業記録 T043
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
エンハンス一括実施のうちT043（文字の自動調整、図解4種、段階表示、候補3・7）。ローカル作業のみ

## 実施内容・変更ファイル
- src/timeline.ts（新規）
  - FPS=24。
  - diagramSteps: 段数。flowは要素数、compareとbranchは2、numberは1。
  - revealInterval: 段の出現間隔。min(1秒, 場面秒数×0.4÷段数)。
  - buildSegments(plan): 区間の配列。区間は{file, scene, step, cue, startFrame, frames}で、段の出現時点と字幕cueの開始時点で切る。フレーム単位の整数。
  - buildRenderSpec: 描画仕様。区間画像を重複なく並べ、各場面の完成状態scene-N.png（全段・最初のcue）を加える。subtitles: 'burn' | 'none'。
- scripts/render.swift（全面改訂）
  - 入力はplan.json（v2）とrender-spec.json、出力は区間PNGとrender-report.json。
  - fitText: boundingRectで高さを測り、1ptずつ縮小する（下限は最大の60%）。収まらなければfitted=falseとして記録し、全描画の後に一覧を出して終了コード1。
  - 図解: drawFlow（2〜4要素で幅を自動計算。3要素のときはM1と同じ座標）、drawCompare、drawNumber、drawBranch。
  - 文字の描画枠（高さ100）、配色、見出し・字幕・フッターの座標はM1と同じ。
- src/media.ts: framesList(plan, segments?)を追加した。encodeは区間を受け取れる。省略時は従来どおりscene-N.pngを使う（tests/media.test.tsが使用）。
- src/commands/sample.ts: segments.jsonとrender-spec.jsonを書いてから描画し、区間を書出しへ渡す。
- tests/timeline.test.ts（新規、7件）。
- tickets/T043.md（done）、docs/STATUS.md。

## 判断と理由
- 区間計算はTypeScript、描画はSwiftに分けた。時間計算をNodeのテストで検証でき、Swiftは描くだけになるため。
- フレームは整数で扱う。書出しのフレーム数のずれ（T044で検査）を防ぐ土台にするため。
- M1との互換: 3要素のflowでbw=(1160-80)/3=360、x=60+i*400になり、旧座標と一致する。最大サイズで収まる文字は旧来と同じ描画呼び出しになる。v1の場面画像のバイト一致で確認した。
- 分岐図の問いの文字が枠の下端に重なったため、y=282を315へ修正した（目視で発見。evidence/v2-branch-fixed.png）。
- 縮小の下限を60%にしたのは、それ以下では720pで判読しにくいため（目安。人の評価はT007で行う）。
- Skill化の評価: 新しい定型手順はない。見送る。

## 検証コマンド・結果・証跡
証跡はevidence/に保存した。
- `--test` → 65件成功。`tsc --noEmit` → エラー0。
- `cli.ts sample`（v1） → reflection-demo-3eac00aa（最終版のrender.swift）。scene-1〜6が7f46324eとcmpで一致した。修正前の53422256でも一致していた。
- `cli.ts sample --plan fixtures/sample-v2.json` → bias-check-demo-75e1b521。completed、21区間・1152フレーム（48秒×24）、render-reportは136件で収まらない文字0。
- 目視: v2-scenes.png（6場面の完成状態、4種の図解）、v2-steps.png（flowの段階表示1→2→4段とcompareの1段目）、v2-branch-fixed.png（分岐図の問いだけの画面と、答えが出た画面）。
- 不合格の確認: scratchpadのoverflow（192字の見出しを、検証を通さずレンダラーへ直接渡す） → 「文字が枠に収まりません」で終了コード1。
  - 証跡の`exit=0`は`| head`の終了コード。単独で実行したときは終了コード1を確認した。
- 縮小の確認: shrink（30字の見出し、14字×4の項目） → 見出しが44→41ptで合格、項目は25ptのまま合格。

## 未実施・制約
- 段階表示はフェードなどの補間がなく、切替は瞬時。
- 文字の配置（縦位置）は固定で、縦方向の中央揃えはしていない。
- 動画全体を連続して目視したわけではない（区間画像の確認のみ）。
- ナレーションに合わせた表示時刻の調整はしていない（cueの秒数に従う）。

## TODO・再開方法
- 次はT044（字幕の焼き込み/ソフトの選択、フレーム数の一致、PSNR、LUFS）。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T044`。
