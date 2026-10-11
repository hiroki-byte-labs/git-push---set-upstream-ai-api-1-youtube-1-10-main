# 正解値との照合: 合格（67/67）

| 図形 | 項目 | 正解 | 解析 | 判定 | 注 |
|---|---|---|---|---|---|
| 全体 | シーン数 | 2 | 2 | ○ |  |
| 全体 | シーン1の切替フレーム | 150 | 150 | ○ |  |
| 全体 | シーン0の背景色 | #14213d | #12213c | ○ | RGB距離8以内 |
| 全体 | シーン1の背景色 | #f1faee | #eff9ec | ○ | RGB距離8以内 |
| card | 対応する図形 | 左の画面外から滑り込む矩形 | s0-e0 | ○ |  |
| card | 形 | rectangle | rectangle | ○ |  |
| card | 色 | #fca311 | #faa211 | ○ | RGB距離8以内（H.264の色差間引きによる誤差を許容） |
| card | 最終位置（中心） | (300, 280) | (300, 280) | ○ | 誤差0px（許容1px） |
| card | 最終の大きさ | 280x160 | 280x160.1 | ○ | 誤差0.1px（許容1px） |
| card | 動きの種類 | translate | translate | ○ |  |
| card | 終了フレーム | 51 | 51（estimated） | ○ | 許容0.5フレーム |
| card | 開始フレーム（観測不能） | ≤ 上限で報告（真値15） | 16（upper_bound） | ○ | 開始時は完全に画面外。開始位置と開始時刻は観測できない |
| card | 開始値（観測不能） | unknown | unknown | ○ | 開始時は完全に画面外。開始位置と開始時刻は観測できない |
| card | 開始フレームのモデル値（参考） | 15 | -3.36 | ○ | 誤差-18.36フレーム。断定値ではないため合否に含めない |
| card | イージング | easeOutCubic | easeOutCubic（estimated） | ○ |  |
| dot | 対応する図形 | 中心から拡大する円（行き過ぎあり） | s0-e1 | ○ |  |
| dot | 形 | circle/ellipse | circle | ○ |  |
| dot | 色 | #2ec4b6 | #2cc3b4 | ○ | RGB距離8以内（H.264の色差間引きによる誤差を許容） |
| dot | 最終位置（中心） | (900, 290) | (900, 290) | ○ | 誤差0px（許容1px） |
| dot | 最終の大きさ | 180x180 | 180x179.99 | ○ | 誤差0.01px（許容1px） |
| dot | 動きの種類 | scale | scale | ○ |  |
| dot | 終了フレーム | 66 | 66.01（estimated） | ○ | 許容0.5フレーム |
| dot | 開始フレーム（観測不能） | ≤ 上限で報告（真値36） | 37（upper_bound） | ○ | 大きさ0から始まるため開始の瞬間は見えない |
| dot | 開始値（観測不能） | unknown | unknown | ○ | 大きさ0から始まるため開始の瞬間は見えない |
| dot | 開始フレームのモデル値（参考） | 36 | 36 | ○ | 誤差0フレーム。断定値ではないため合否に含めない |
| dot | イージング | easeOutBack | easeOutBack（estimated） | ○ |  |
| bar | 対応する図形 | 左端を固定して右へ伸びる帯 | s0-e2 | ○ |  |
| bar | 形 | rectangle | rectangle | ○ |  |
| bar | 色 | #e5e5e5 | #e4e4e5 | ○ | RGB距離8以内（H.264の色差間引きによる誤差を許容） |
| bar | 最終位置（中心） | (640, 532) | (640, 532) | ○ | 誤差0px（許容1px） |
| bar | 最終の大きさ | 800x24 | 800x24 | ○ | 誤差0px（許容1px） |
| bar | 動きの種類 | grow | grow | ○ |  |
| bar | 終了フレーム | 114 | 114（estimated） | ○ | 許容0.5フレーム |
| bar | 開始フレーム（観測不能） | ≤ 上限で報告（真値78） | 79（upper_bound） | ○ | 幅0から始まる |
| bar | 開始値（観測不能） | unknown | unknown | ○ | 幅0から始まる |
| bar | 開始フレームのモデル値（参考） | 78 | 76.2 | ○ | 誤差-1.8フレーム。断定値ではないため合否に含めない |
| bar | イージング | linear | linear（estimated） | ○ |  |
| square | 対応する図形 | 左下から右上へ移動する正方形 | s1-e1 | ○ |  |
| square | 形 | rectangle | rectangle | ○ |  |
| square | 色 | #e63946 | #e53845 | ○ | RGB距離8以内（H.264の色差間引きによる誤差を許容） |
| square | 最終位置（中心） | (1000, 200) | (999.99, 200.01) | ○ | 誤差0.01px（許容1px） |
| square | 最終の大きさ | 120x120 | 120.12x120.11 | ○ | 誤差0.12px（許容1px） |
| square | 動きの種類 | translate | translate | ○ |  |
| square | 終了フレーム | 210 | 210（estimated） | ○ | 許容0.5フレーム |
| square | 開始フレーム | 168 | 168（estimated） | ○ | 許容0.5フレーム |
| square | イージング | easeInOutCubic | easeInOutCubic（estimated） | ○ |  |
| banner | 対応する図形 | フェードインする帯 | s1-e2 | ○ |  |
| banner | 形 | rectangle | rectangle | ○ |  |
| banner | 色 | #457b9d | #437a9b | ○ | RGB距離8以内（H.264の色差間引きによる誤差を許容） |
| banner | 最終位置（中心） | (280, 110) | (280, 110) | ○ | 誤差0px（許容1px） |
| banner | 最終の大きさ | 400x100 | 400x100.01 | ○ | 誤差0.01px（許容1px） |
| banner | 動きの種類 | fade-in | fade-in | ○ |  |
| banner | 終了フレーム | 246 | 245.95（estimated） | ○ | 許容0.5フレーム |
| banner | 開始フレーム（観測不能） | ≤ 上限で報告（真値216） | 222（upper_bound） | ○ | 不透明度0では見えない |
| banner | 開始値（観測不能） | unknown | unknown | ○ | 不透明度0では見えない |
| banner | 開始フレームのモデル値（参考） | 216 | 216.1 | ○ | 誤差0.1フレーム。断定値ではないため合否に含めない |
| banner | イージング | easeInOutSine | easeInOutSine（estimated） | ○ |  |
| stick | 対応する図形 | 中心で90度回転する細長い矩形 | s1-e0 | ○ |  |
| stick | 形 | rectangle | rectangle | ○ |  |
| stick | 色 | #1d3557 | #1b3457 | ○ | RGB距離8以内（H.264の色差間引きによる誤差を許容） |
| stick | 最終位置（中心） | (700, 520) | (700, 520) | ○ | 誤差0px（許容1px） |
| stick | 最終の大きさ | 260x50 | 260x50.01 | ○ | 誤差0.01px（許容1px） |
| stick | 最終の角度 | 90 | 90 | ○ | 許容1度 |
| stick | 動きの種類 | rotate | rotate | ○ |  |
| stick | 終了フレーム | 282 | 282（estimated） | ○ | 許容0.5フレーム |
| stick | 開始フレーム | 252 | 252（estimated） | ○ | 許容0.5フレーム |
| stick | イージング | easeInOutQuad | easeInOutQuad（estimated） | ○ |  |

