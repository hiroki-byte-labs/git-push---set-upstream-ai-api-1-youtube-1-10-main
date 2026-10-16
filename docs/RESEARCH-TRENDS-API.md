# YouTube Data API v3による公開データのトレンド・成長分析の利用条件（T131）

## 調査の概要
- 確認日: 2026-10-13（UTC）。記録: Claude Code（claude-opus-5-5）。
- 方法: WebFetchで公式ページを取得し、要約経由で確認した。**逐語一致は保証しない。** 運用開始前（T133）に、人が原文を目視で確認する。
- 認証・API呼び出し・課金・申請はしていない。
- 表記: 【事実】公式ページの記載。【推論】設計上の解釈で、公式の個別回答ではない。【未確認】公式で確認できなかった事項。

## 1. 参照した公式資料
| 資料 | URL | ページの最終更新 |
|---|---|---|
| YouTube API Services Developer Policies | https://developers.google.com/youtube/terms/developer-policies | 2026-09-14 |
| Additional policies for derived metrics and data storage | https://developers.google.com/youtube/terms/derived-metrics-policy | 2026-09-14 |
| Quota costs | https://developers.google.com/youtube/v3/determine_quota_cost | 2026-10-08 |
| videos.list | https://developers.google.com/youtube/v3/docs/videos/list | 2026-09-14 |
| Videos resource | https://developers.google.com/youtube/v3/docs/videos | 2026-10-08 |
| channels.list | https://developers.google.com/youtube/v3/docs/channels/list | 2026-09-14 |
| Channels resource | https://developers.google.com/youtube/v3/docs/channels | 2026-09-16 |
| videoCategories.list | https://developers.google.com/youtube/v3/docs/videoCategories/list | 2026-09-14 |
| Errors | https://developers.google.com/youtube/v3/docs/errors | 2026-09-14 |
| Getting started | https://developers.google.com/youtube/v3/getting-started | 2026-09-14 |

## 2. 取得できるデータ
### メソッドとクォータ【事実】
| メソッド | 用途 | 費用 | 主なパラメータ |
|---|---|---|---|
| videos.list（chart=mostPopular） | 地域・カテゴリ別の人気動画 | 1 unit/回 | regionCode、videoCategoryId（0=全体）、maxResults 1〜50、pageToken |
| videos.list（id=...） | 指定動画の統計の再取得 | 1 unit/回 | idはカンマ区切り。maxResults/pageTokenは使えない |
| channels.list（id=...） | チャンネル統計 | 1 unit/回 | idはカンマ区切り |
| videoCategories.list | カテゴリ名の対応表 | 1 unit/回 | regionCode または id、hl |
| search.list | 検索（**本基盤では使わない**） | 1回、専用バケット100回/日 | statisticsを含まない |

- 一般枠は**10,000 unit/日**（search.listとvideos.insertを除く全メソッドの合計）。リセットは**太平洋時間0時**。
- **無効なリクエストも最低1 unitを消費する。**
- 1回で指定できるidの上限は、videos.list・channels.listとも公式ページに記載がない【未確認】。従来の慣行から50件で分割する【推論】。
- 公開データの取得はAPIキーだけで行える（「unauthorized requests only retrieve public data」、サンプルはkeyのみ）【事実に近い推論】。OAuthは不要。

### フィールドの意味と注意【事実】
- videos: `snippet.publishedAt`（非公開→公開の場合は公開時刻）、`snippet.categoryId`、`snippet.channelId`（トピックチャンネル等への付け替えで**変わりうる**）、`statistics.viewCount/likeCount/commentCount`。`dislikeCount`は所有者認証時のみ、`favoriteCount`は常に0（廃止）。
- **viewCountの定義は2026-08-24に変更された**（再生開始時点で計上。自動再生・ホバー再生を含む）。この日をまたぐ比較は定義が異なる【事実】→ 比較不能として扱う【推論】。
- channels: `statistics.subscriberCount`は**有効数字3桁に切り捨て**（12,345→12,300）。`hiddenSubscriberCount=true`なら非公開。`videoCount`は公開動画のみ。
- 再生数・高評価数が非公開/無効のときにフィールドが省略されるかは記載なし【未確認】→ 欠測として扱う【推論】。
- カテゴリは地域ごとに利用可能なものが返る（regionCode指定）。地域で異なりうる【推論】。

### エラー【事実】
- `quotaExceeded`: HTTP 403。videos.list: `videoChartNotFound`（400）、`forbidden`（403）、`videoNotFound`（404）。videoCategories.list: `videoCategoryNotFound`（404）。
- `rateLimitExceeded`、`keyInvalid`、`backendError` 等のグローバルな一覧は公式ページで確認できなかった【未確認】。HTTP 429/5xxは一時障害、400/401/403（quotaExceeded以外）は設定・認証の誤りとして扱う【推論】。

## 3. 保存・集計・派生指標の制約（最重要）
### 標準の開発者（監査・追加承認なし）【事実】
- **III.E.4.d**: 認証なしで取ったデータ（Non-Authorized Data）は、限られた量を**最長30暦日**まで一時保存できる。期限後は削除するか更新する。
- **III.E.4.b**: 所有者の認可なしに取得した統計（登録者数など）を**30日を超えて保存してはならない**。
- **III.E.4.e/f**: 保存データは現在の値と整合させる努力をする。表示は最新値を基本とし、**過去の値は時点を正確に示す場合に限り**表示できる。
- **III.E.4.h**: API Dataを**同種の独自計算値で置き換えたり、API Dataから新しい指標・派生データを作ってはならない。** YouTube由来でない指標は、YouTube由来でないことを明示する。
- **III.E.2**: 集約は同一コンテンツ所有者のチャンネルに限る。**YouTubeの利用状況・収益・事業の把握（business intelligence）を目的に集約・APIを使ってはならない。** 異なるコンテンツ所有者のデータを結合しない。
- **III.E.1**: 映像本体の保存・ダウンロードは不可。**III.E.6**: スクレイピングは不可。
- **III.D.1**: APIの認証情報は第三者と共有しない。オープンソースに埋め込まない。API Clientごとに専用のAPIプロジェクトを使う。

### 監査済みで追加承認を得た開発者（III.L、2026-06-01以降）【事実】
- 分析用途で、クォータ拡張申請（Quota and Compliance Audit）を通じて明示的に申請し、Developer Policiesの修正条項を受諾した開発者だけが対象。
- 統計（views・likes・登録者数・コメント数）と派生指標を**最長36暦月**保存できる（複数年の時系列が可能）。
- 許される派生指標の例: 平均・合計・比率による独自スコア、**再生増加ランキング・登録者の増加曲線などの比較**、YouTubeカテゴリを置き換えない補助タグ。
- タイトル・チャンネル名・説明文などの統計以外は、**引き続き30日で更新または削除**。
- 表示: 派生指標をAPIデータと明確に区別し、APIデータを偽装しない（例: 登録者数をスコアとして示さない）。独自タグを公式カテゴリとして示さない。嫌がらせ・対立を煽る見せ方をしない。
- 集約の個別規則は派生指標ポリシーに記載がない【未確認】。III.E.2の事業動向把握の禁止が承認後も残るかは不明【未確認】。

### 本基盤の目的との照合【推論】
| 計画した処理 | 標準の開発者 | III.L承認後 |
|---|---|---|
| 公開統計を取得時刻つきで保存 | 30日以内なら可。期限後は削除 | 統計は36か月まで可。タイトル等は30日 |
| 動画・チャンネルの増加量・増加率 | **III.E.4.hにより不可**（派生指標） | 可（比較・増加ランキングが例示） |
| カテゴリ別の分布・変化 | **III.E.4.h・III.E.2により不可** | 派生指標としては可の可能性。III.E.2の事業動向把握に当たるおそれは残る【未確認】 |
| 過去の値の表示 | 時点を明示すれば可（30日以内のデータ） | 時点を明示すれば可 |
| 合成データでの算出・表示 | APIデータではないため制約の対象外 | 同左 |

## 4. 後続実装への制約（T132〜T137が守る条件）
1. **データの出所を必ず区別する。** スナップショットは `source: synthetic | youtube-data-api` を持つ。合成データは常に分析できる。
2. **APIデータの派生指標・カテゴリ集計は既定で停止する。** 分析・レポートは、ポリシー設定 `policyProfile` が `audited-derived-metrics` で、人が記録した承認の参照（申請受付番号など。秘密値ではない）がある場合だけ、APIデータに対して実行する。それ以外は理由を示して停止する（終了コード非0）。
3. **保持期限を強制する。** 標準: APIデータはすべて取得から30日で削除。承認後: 統計は36か月、タイトル等の統計以外は30日で削除（または更新）。期限切れの削除を履歴の操作として実装し、試験する。
4. **過去の値は取得日時を必ず添える。** レポートは各値の取得日時とデータ鮮度を表示する。
5. **viewCount定義変更（2026-08-24）をまたぐ差分は比較不能として出す。** 登録者数は3桁切り捨ての近似値であることを表示し、非公開なら欠測にする。
6. 使うメソッドは videos.list（chart=mostPopular / id）、channels.list（id）、videoCategories.list の3種だけ。search.list・書き込み系は実装しない。
7. 送信前にクォータを見積り、日次上限（既定10,000）とプロジェクトの安全上限を越える計画は送信しない。無効なリクエストも1 unitとして数える。
8. APIキーは環境変数から注入し、ログ・エラー・保存データに出さない。
9. 「YouTube Analytics」等の公式表現と紛らわしい名称や、YouTubeが算出した値と誤認させる表示をしない。派生値は「本ツールの算出値（YouTube提供値ではない）」と明記する。

### 後続実装を止める条件
- 実APIデータに対して派生指標やカテゴリ集計を出す前に、III.L承認（人）がないとき。
- III.E.2の「事業動向の把握」への該当性について、人が判断していないままカテゴリ集計を実データで公開・共有しようとするとき。
- 公式文書の更新で、上記の保存期間・派生指標の扱いが変わったとき（確認日から90日を目安に再確認する）。

## 5. 必要な人の判断・作業（T133）
- 専用のGoogle CloudプロジェクトでYouTube Data API v3を有効化し、APIキー（API制限: YouTube Data API v3のみ）を作るかどうか。OAuthは不要。
- 実APIデータで成長指標を使うなら、Quota and Compliance Audit と派生指標の修正条項（III.L）を申請するか。申請しない場合、実データは「30日以内の取得値の時点つき表示」だけに使い、成長・カテゴリ分析は合成データの試験に限る。
- III.E.2（事業動向把握の禁止）への該当性の判断。
- 申請・キー作成・実API呼び出しはいずれも未実施。

## 6. 旧調査（T030・T086）との差分
- T030（docs/RESEARCH-YOUTUBE.md）: 投稿用のクォータ（videos.insert専用枠）を調べた。今回、一般枠10,000/日、無効リクエストの課金、読み取り系メソッドの費用を分析用途として確認した。
- T086（docs/RESEARCH-TOPICS.md）: 30日保存・派生指標の禁止（III.E.4.h）・集約禁止（III.E.2）を確認し、自動スコア化をしない方針にした。**今回の新事実**: III.L（2026-06-01から）により、監査済みの分析用途で承認を得れば、統計の36か月保存と増加ランキング等の派生指標が認められる。逆に、承認がない限りT086の方針（派生指標・集約をしない）は変わらない。
- 新事実: viewCountの定義変更（2026-08-24）、channelIdの付け替え、登録者数の3桁切り捨て。
