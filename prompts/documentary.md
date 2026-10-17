# 長尺台本の構造化入力（T178）

`src/documentary.ts` の `DocumentaryInput` に従いJSONを作る。題材は本人の選択を尊重し、本人の考察は空のreflection章を1つ置く。6〜8章は「命題提示→直感の解体→理論→一般化→本人考察→結び」を基本に、問いが変わる箇所で区切る。比喩的な章題は24字以内。論文の結論を個人の成功法則へ断定的に拡張しない。

- hooks: 異なる2つの学術的な切り口。単語を並べるだけでなく本文で両者を説明する。
- sources: 著者・文献名・発表年・URL・原本確認日とprimary:true。未読の二次紹介を一次資料扱いしない。
- paragraphs: 原文、claim/inference/fictional、視覚メタファー、説明上の目的、既存のDiagram。
- metaphor: Spotlight / MetricBar / CausalFlow / SilhouetteGroup / CollageScene。これは制作指示であり、すべての演出をrendererが実装済みという意味ではない。
- claim/inferenceの全文をchecks.claimと1対1で対応させる。照合済みの箇所（locator）・確認者・日時・URLと原文SHA-256を記録する。推論はstatus:inferenceと根拠noteを付け、本文でも推論だと分かる書き方にする。
- 未照合はunverifiedとし、生成ゲートを通さない。URLの実在、primary:true、ハッシュ一致だけで内容が正しいとは判断しない。エージェントが原本を読んで照合する工程が必要。
- 例示はfictionalを明記する。導入文も同様にfictional:trueかcheckIdを指定する。
- 考察章はreflection:true, paragraphs:[]。本人の文章を作らない。
- 冒頭に問い、結びに結果を保証しない免責を入れる。本文5,000〜8,000字、5.2〜5.8字/秒で、合計600〜1200秒の両方を満たす。8,000字をゆっくり読むと20分を超えるため内容を絞る。

実行:

```sh
./scripts/run src/documentary-cli.ts /path/chapters.json /path/draft-plan.json
./scripts/run src/cli.ts produce script <案件ID> --plan /path/draft-plan.json --by エージェント名
```

出力先の既存ファイルは上書きしない。Plan v2の追加documentary欄に章の視覚指示、二重フック、照合記録、下書き段階の文字数・尺を保持する。本人考察未入力のためlintはreflection-missingを残す。この1項目以外のerrorはコンパイルを拒否する。本人考察の注入後には既存のlint・承認を再実行する。documentaryの尺は下書き時点の記録で、注入後の確定尺は各scene.secondsから再計算する。

`fixtures/documentary-structure-demo.ts` は反復する架空文を使った構造/文字保存/尺検査専用fixture。公開用台本、一次資料を説明する完成原稿、本人の考察、承認済みコンテンツではない。文献定義があることと本文を照合済みであることは異なる。
