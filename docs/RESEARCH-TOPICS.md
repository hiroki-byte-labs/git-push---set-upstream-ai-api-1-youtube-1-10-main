# 題材選び（検索需要・競合）の調査方法（T086）

## 調査の概要
- 確認日: 2026-10-08。
- 記録: Claude Code（claude-opus-5-5）。調査はサブエージェントがWebSearch/WebFetchで公式資料を確認した。
- 登録・認証・API実行・有料ツールの契約はしていない。
- **取得の限界**: WebFetchの要約経由のため、逐語一致は保証しない。運用前に、原文を人が目視で確認する。
- **目的**: 再生が上位チャンネルに集中する中で（G11）、需要があり、自分が差別化できる題材を、規約に反しない方法で選ぶ。

## 1. 使えるデータ源と制約
### YouTube Data API v3
**search.list**
- 公式: https://developers.google.com/youtube/v3/docs/search/list 、https://developers.google.com/youtube/v3/determine_quota_cost
- クォータ: 1回1 unitで、専用の「Search Queries」バケットから消費する（既定100回/日。2026-06-01から専用バケット）。リセットは太平洋時間0時。
- 取得できる項目: idとsnippet（タイトル、説明、チャンネル、公開日など）。**再生数などのstatisticsは含まれない。**
- 主なパラメータ
  - order: relevance、viewCount、dateなど。
  - regionCode=JP、relevanceLanguage=ja。
  - type=video。
  - publishedAfter / publishedBefore。
  - videoDuration: short=4分未満、medium=4〜20分、long=20分超。
  - maxResults: 50まで。

**videos.list**
- 公式: https://developers.google.com/youtube/v3/docs/videos/list
- part=statisticsで、viewCount、likeCount、commentCountが取れる（1 unit、一般枠10,000/日）。
- chart=mostPopularとregionCodeで、国別の人気動画が取れる。

**保存・利用の制約**（YouTube API Services Developer Policies、https://developers.google.com/youtube/terms/developer-policies 、最終更新2026-09-14）
- III.E.4.d: 認証なしで取るデータ（検索結果など）は、限られた量を**最長30日**まで一時保存できる。
- III.E.4.e/f: 保存したデータは最新に保つ。過去の値は時点を明示する場合に限り表示できる。
- III.E.4.h: API Dataから**新しい指標や派生データを作ることは禁止**（例外は監査済み開発者の分析用途の許可）。
- III.E.2: 集約は原則禁止。YouTubeの事業動向を把握する目的の利用も禁止。
- スクレイピングは禁止。
- **解釈（未確認）**: 競合の再生数から独自スコア（再生数/登録者比など）を計算して保存することは、III.E.4.hとIII.E.2に抵触する可能性が高い。公式の個別回答ではない。

### Google Trends
- 公式: https://developers.google.com/search/apis/trends 、https://support.google.com/trends/answer/4365538 、https://support.google.com/trends/answer/4365533
- **手動CSV**: グラフ右上の「Download」で取得できる。利用はGoogle Terms of Serviceに従う。
  - 再利用時は「Data source: Google Trends (https://www.google.com/trends)」と出典を表示する。Google Adsのデータと併記しない。
- **値の意味**: 地域・期間の総検索に対する割合を0〜100に正規化したもので、サンプルに基づく。絶対的な検索数ではない。
- **YouTube検索**: 検索種別に「YouTube検索」を選べる（Google News Initiativeの教材）。
- **Trends API**: 2025年7月発表のalphaで、申請制。料金と条件は未記載。YouTube検索への対応は未確認。非公式ライブラリによる自動取得は使わない。

### YouTube Studioの「トレンド」タブ（旧リサーチ）
- 公式: https://support.google.com/youtube/answer/11962757
- 見られるもの
  - 上位の検索キーワード（自分の視聴者と保存した検索に基づく、直近28日）
  - 「YouTube で多い検索内容」
  - 「ショート動画のコンテンツ ギャップ」など
- 手動で閲覧する前提で、自動取得の公式手段は確認できなかった。
- 一部の分析は国・言語・デバイスで限定される。日本語で全セクションが出るかは未確認（チャンネル開設後に人が確認する）。
- Inspirationタブ（AIの提案、英語のみ）は2026年8月から段階的に廃止され、後継はAsk Studio。

### 日本の公開統計（題材の根拠に使う）
- 金融庁「NISA口座の利用状況に関する調査結果（令和7年12月末時点）」: https://www.fsa.go.jp/policy/nisa/20260703.html
  - 年代別・都道府県別のExcelがある。口座数などの数値は、引用時に原典で確認する。
- 日本証券業協会「2024年度 証券投資に関する全国調査（個人調査）」: https://www.jsda.or.jp/shiryoshitsu/toukei/data/20241007164330.html
  - 18歳以上7,000人。保有・意向・知識を収録している。
- J-FLEC「家計の金融行動に関する世論調査」: https://j-flec.go.jp/wpimages/uploads/kakekin2025_260121.pdf （本文は未取得）
- 総務省統計局「家計調査（貯蓄・負債編）」: 最新のURLは未確認。

## 2. 題材候補表の作り方（規約に沿った手順）
ひな型: [docs/templates/topic-candidates.csv](templates/topic-candidates.csv)

1. **種キーワード（人）**: 公開統計の論点とチャンネルの方針（T070）から、30〜50語を人が用意する。
2. **YouTube上の相対的な需要（人・手動）**: Google Trendsで「YouTube検索、日本、過去12か月」を選び、相対値と上昇中の関連語を見る。
   - CSVを手動でダウンロードし、出典の表記と取得日を残す。
3. **Studioの「トレンド」タブで裏付け（人・手動）**: 「YouTube で多い検索内容」とコンテンツギャップを見て、所見をメモする。
4. **競合の確認（API。T031の認証後、承認を得てから）**
   - search.list（regionCode=JP、relevanceLanguage=ja、type=video、直近12か月）で上位のvideoIdを取る。videos.listで、再生数をそのまま参照する。
   - search.listは1日100回の枠内で使う。
   - 取得値は取得日時付きでそのまま記録し、**30日以内に削除または更新する。**
   - 再生数を使った独自スコアの計算、競合の集約・ランキングはしない。
5. **編集判断（人）**: 差別化の切り口、根拠にする公的統計、注意事項（投資助言に当たらないか、出典の要否）、採否を書く。**優先度は人の定性評価で付け、数式で自動スコア化しない。**

## 3. 運用上の注意
- APIの生データは保存期限（取得から30日）を過ぎたら削除する。長く残すのは、人のメモと公的統計だけにする。
- Trendsの値は相対値で、題材間の絶対的な需要比較には使えない。同じグラフに並べて比べる（最大5語）。
- 題材の選定理由を台本（promise、出典）と概要欄に反映し、タイトル・サムネイルとの一致を保つ（T074、T075）。
- 競合調査の自動化（API実装）は、T031の認証と利用者の承認の後に、別チケットで行う。今回は手順とひな型だけ。
