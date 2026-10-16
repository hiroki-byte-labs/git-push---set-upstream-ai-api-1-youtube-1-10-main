# トレンド・成長指標とデータ形式（T132）

利用条件の根拠は [RESEARCH-TRENDS-API.md](RESEARCH-TRENDS-API.md)（T131）。型と検査は `src/trends-schema.ts`、算出は `src/trends-metrics.ts`（T136）。

## 1. 前提（T131の制約）
- 保存するのはAPIが返した値そのもの（スナップショット）だけ。派生値は保存せず、表示のたびに計算する。
- 派生指標（増加量・増加率・カテゴリの構成比など）は、**合成データ**には常に出せる。**APIデータ**には、ポリシー設定が `audited-derived-metrics`（III.L承認の参照つき）の場合だけ出す。カテゴリ集計はさらに `categoryAggregationApproved`（III.E.2の該当性を人が判断済み）が必要。それ以外は理由を示して停止する（`derivedAllowed`）。
- 保持期限（`retentionDeadlines`）: standardはAPIデータ全体を取得から30日。承認後は統計36か月、タイトル等の統計以外30日。合成データは無期限。
- 派生値は「本ツールの算出値（YouTube提供値ではない）」と表示する。

## 2. 識別子と単位
| 対象 | 識別子 | 備考 |
|---|---|---|
| 動画 | videoId | `snippet.channelId` はトピックチャンネル等への付け替えで変わりうる。所属はその時点の値を使う |
| チャンネル | channelId | 登録者数は有効数字3桁の切り捨て値 |
| カテゴリ | (regionCode, categoryId) | 名前は videoCategories.list（地域別）。categoryIdがnullや対応表にない値は `unknown` |
| 時刻 | fetchedAt（UTCのISO 8601） | 取得した時刻。公開日時 publishedAt とは別 |

## 3. データ形式 `yt-trends-batch/v1`
1回の収集を1つのbatchにする。同じbatchは同じ出所（source）と地域（regionCode）を持つ。
```
{ schema: 'yt-trends-batch/v1', batchId, source: 'synthetic'|'youtube-data-api', regionCode: 'JP',
  startedAt, completedAt, quotaUnits,
  charts: [{chartCategoryId, fetchedAt, complete}],   // chart=mostPopularを取得したカテゴリ。'0'は全体
  categories: [{categoryId, title, assignable}],
  videos: [{videoId, fetchedAt, status: 'ok'|'missing', chart: {chartCategoryId, rank}|null,
            channelId, categoryId, publishedAt, title, viewCount, likeCount, commentCount}],
  channels: [{channelId, fetchedAt, status, title, viewCount, subscriberCount, subscriberCountHidden, videoCount}] }
```
- 統計値は0以上の整数かnull。nullは「取得できなかった・非公開」。0と区別する。
- `status: 'missing'` は、id指定で要求したのに返らなかった（削除・非公開化・存在しない）こと。統計とチャート位置を持たない。
- `complete: false` のチャートは、ページングを途中で止めたもの。構成比の母数に使わない。
- スキーマ版が異なるものは読み込まない（検査で停止）。

## 4. 指標
記号: V(t)=時刻tの値、W=名目の観測窓（日）、t1=基準時刻以前で最新の有効な観測、t0=t1−Wに最も近いt1より前の有効な観測、E=t1−t0（日）。

| 指標 | 式 | 単位 | 必要データ | 比較できる条件 | 限界 |
|---|---|---|---|---|---|
| 動画の再生増加量 | ΔV=V(t1)−V(t0) | 回 | 動画の2時点のviewCount | 下記「共通の比較条件」 | チャート外の動画は追跡対象（id指定）にしないと得られない |
| 動画の1日当たり増加 | ΔV/E | 回/日 | 同上 | 同上 | 窓内の偏り（初速）は見えない |
| 動画の相対増加率 | ΔV/V(t0) | 倍（比） | 同上 | V(t0)>0 | V(t0)=0はnull。小さい母数で過大になる |
| チャンネルの再生増加量・1日当たり | 同上（channels.viewCount） | 回、回/日 | 2時点 | 同上 | 全動画の合計 |
| チャンネルの登録者増加量 | ΔS=S(t1)−S(t0) | 人 | 2時点のsubscriberCount | 両時点で公開 | **3桁切り捨てのため±max(u(S0),u(S1))の誤差**。u(x)=10^(桁数−3)（3桁以下は1） |
| チャンネルの動画数増加 | ΔN | 本 | videoCount | 同上 | 公開動画のみ |
| カテゴリの人気チャート構成比 | share_c(t)=n_c(t)/N(t) | % | 全体チャート（'0'、complete）の各動画のcategoryId | 同じ地域、両時点の全体チャートが完全 | **人気チャートの上位N件の内訳で、YouTube全体の動向ではない**。N<20は低標本 |
| 構成比の変化 | share_c(t1)−share_c(t0) | ポイント | 同上 | 同上 | 同上 |
| カテゴリの増加の中央値 | t1時点のカテゴリcに属する比較可能な動画の ΔV/E の中央値 | 回/日 | 動画の増加 | 標本n≥5（未満は低標本の注記） | 追跡対象の選び方に依存する |

### 共通の比較条件（満たさない場合は値をnullにして理由を出す）
| 理由コード | 条件 |
|---|---|
| `insufficient-snapshots` | 有効な観測が1つ以下 |
| `missing-latest` | 基準時刻で最新の観測が `missing`（削除・非公開化）。増加を出さない |
| `value-unavailable` | どちらかの値がnull（非公開・取得不可） |
| `interval-mismatch` | \|E−W\|/W > 0.25（観測窓が名目と25%超ずれる） |
| `view-count-redefined` | t0 < 2026-08-24T00:00Z ≤ t1（viewCountの定義変更をまたぐ。動画・チャンネルの再生数のみ） |
| `count-decreased` | ΔV<0（集計の訂正などで減った）。増加として扱わない |
| `source-mixed` | t0とt1の出所が異なる |
| `stale` | 基準時刻とt1の差が鮮度の上限（既定2日）を超える。値は出すが注記する |

`stale` 以外の理由が1つでもあれば比較不能（値はnull）。

## 5. 手計算例（`fixtures/trends/synthetic-history.json`、W=7、基準 2026-10-08T00:00Z）
| 対象 | t0の値 | t1の値 | 結果 |
|---|---|---|---|
| vidA0000001 | 1,000 | 8,000 | ΔV=7,000回、1,000回/日、相対7.0 |
| vidB0000001 | 5,000 | 6,400 | ΔV=1,400回、200回/日、相対0.28 |
| vidC0000001 | 0 | 700 | ΔV=700回、100回/日、相対null（開始0） |
| vidD0000001 | 2,000 | missing | missing-latest |
| vidE0000001 / vidF0000001 | − | 1回のみ | insufficient-snapshots |
| chX 登録者 | 12,300 | 12,500 | ΔS=200人 ±100 |
| chX 再生 | 100,000 | 108,000 | 8,000回、1,142.857…回/日 |
| chX 動画数 | 10 | 11 | +1本 |
| chY 登録者 | 非公開 | 非公開 | value-unavailable |
| chZ 登録者 | 990 | 1,000 | ΔS=10人 ±10（u(990)=1、u(1000)=10） |

カテゴリ構成比（全体チャート、t0 N=4 / t1 N=5、どちらも低標本）:
| カテゴリ | t0 | t1 | 変化 |
|---|---|---|---|
| 10 Music | 2/4=50% | 2/5=40% | −10ポイント |
| 20 Gaming | 1/4=25% | 2/5=40% | +15ポイント |
| 27 Education | 1/4=25% | 0% | −25ポイント |
| unknown | 0% | 1/5=20% | +20ポイント |

カテゴリの増加の中央値: 10 Music = median(1,000, 100) = 550回/日（n=2、低標本）、20 Gaming = 200回/日（n=1、低標本）。

境界例（`fixtures/trends/boundary-cases.json`）:
- vidR0000001: 2026-08-20→08-27（W=7）は定義変更をまたぐため `view-count-redefined`。
- vidG0000001: 1,000→900（W=7、基準10-08）は `count-decreased`。
- vidM0000001: 10-01→10-02（W=7、基準10-02）はE=1日で `interval-mismatch`。基準10-08では最新の観測が6日前で `stale` も付く。

## 6. 比較してはいけないもの
- 異なる地域（regionCode）のチャート構成比どうし。
- 人気チャートの構成比を、YouTube全体のカテゴリ別視聴量とみなすこと。
- 登録者数の小さな増減（切り捨て単位以下）。
- 観測間隔が大きく異なる動画どうしの増加量（1日当たりで比べ、間隔のずれは理由コードで除外する）。
- 増加と原因（題材・投稿時刻など）を結び付けること（因果は推定しない）。
