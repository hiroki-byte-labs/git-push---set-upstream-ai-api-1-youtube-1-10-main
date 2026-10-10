# 収益化に向けた動画・チャンネル要件の調査（T017）

## 調査の概要
- 調査日: 2026-10-08。
- 記録: Claude Code（claude-opus-5-5）。調査は2つのサブエージェントがWebSearch/WebFetchで行い、報告を本書にまとめた。
- 目的: 利用者の作業（契約・認証）が済み、動画の作成・編集・投稿ができるようになった後、YPP（収益化）に至るまでの課題を先に洗い出す。海外の論文・研究と公式資料を根拠にする。
- **確度の表記**
  - 【査読】【プレ】プレプリント・ワーキングペーパー・未査読【公式】YouTube/Googleなどの公式資料【業界】業界調査・規制当局・業界団体
- **確認範囲の表記**
  - 本文確認: PDF本文で数値を照合した。
  - 抄録確認: 要旨だけを確認した。
  - 二次情報: 原典では未照合。
- 推測は書いていない。確認できなかった事項は「未確認」とした。
- **適用上の注意**
  - 教育動画の研究の多くはMOOCや実験室のデータで、YouTubeの一般視聴者や日本語にそのまま当てはまるとは限らない。
  - 日本語TTSの評価研究と、日本市場の査読付き成長研究は見つからなかった。
  - 金融ジャンルのCPMは業界推計しかなく、公式・学術の裏付けは未確認。
- 現状のリポジトリの機能は docs/HANDOFF.md（2026-10-08時点）を前提にした。

## 1. 結論
1. **最大のリスクは「量産的・反復的なコンテンツ（inauthentic content）」と判定され、チャンネル単位で収益化が止まること。**
   - 現行の動画は、全本数で同じ背景・同じレイアウト・定型の図解・字幕の構成になる。
   - これはポリシーが例に挙げる「テンプレート化した画像スライドショー＋字幕」に近い（G19）。
2. **推薦は「インプレッションあたりの期待視聴時間」と「満足度」で決まる**（G1、G2、G3）。
   - クリック率だけを追う設計（クリックベイト）は不利になる。
   - サムネイル・タイトル・冒頭の一致、視聴維持、視聴データの振り返りを作る必要がある。
3. **動画の中身の要件**（教育・解説動画の研究から）
   - 6分程度の単位での分割（E1、E14）。
   - ナレーション全文を画面に重ねず、キーワードや強調で示す（E12、E13）。
   - 会話調（E7）、物語と具体例（E29、E32）、途中の問いかけ（E5）、本筋と無関係な演出を避ける（E17）。
   - 声は現代の高品質TTSなら学習効果は人の声とほぼ同等だが、信頼では人の声が有利（E19〜E23）。
4. **金融ジャンル**: 開示・出典・定量的な内容が信頼の要素になる。質の低い発信者ほどフォロワーを集めやすいという報告もある（G27、E35〜E37）。

## 2. 現行リポジトリとの差（23項目とチケット）
重大度: A=収益化審査のリスク、B=推薦とクリック、C=動画の中身、D=チャンネル運用。

| # | 重大度 | 足りないもの | 主な根拠 | 現状 | チケット |
|---|---|---|---|---|---|
| 1 | A | 動画ごとの独自性と、人の創作が入った証拠 | G19 | レイアウト・配色は共通で、人が手を入れる工程がない | T070 (human) |
| 2 | A | AI利用と、人が監修・検証したことの表示 | G21/E27、G20、G22 | 概要欄の生成も開示の設定もない | T071 |
| 3 | A | 出典・立場・利害関係の可視化 | G27、E35〜E38 | 出典は台本データにだけあり、画面・概要欄に出ない | T072 |
| 4 | B | サムネイルの生成 | G9、G6、G7、G5 | なし | T073 |
| 5 | B | タイトル・概要欄・チャプターの生成と、公開後の見直し記録 | G9、G18 | なし | T074 |
| 6 | B | 冒頭30秒で約束の内容に入る構成 | G18、E28 | 構成のルールがない | T075 |
| 7 | B | 視聴データ（維持率・CTR・満足度）を次の制作に活かす | G15、G3 | なし。Analytics APIは未調査 | T076 |
| 8 | C | 信頼される声と、話速・間の制御 | E18〜E24 | 確認音のみ。声の選定はT027 | T077 |
| 9 | C | 全文字幕の重複を避け、キーワードで強調する | E12、E40、E4 | 既定は焼き込みの全文字幕 | T078 |
| 10 | C | 注目を誘導する演出（強調・動的描画・場面転換） | E13、E4、E2 | 段階表示は瞬時の切替だけ | T079 |
| 11 | C | 章立て、途中のまとめ・問いかけ | E1、E14、E5 | 台本に章・まとめ・問いの概念がない | T080 |
| 12 | C | 物語の構成と具体例 | E29、E32、E17 | 構成を扱っていない | T081 |
| 13 | C | 会話調 | E7 | 台本生成の指示文に記載がない | T082 |
| 14 | C | 用語の先出し説明（事前学習） | E15 | 用語説明の場面がない | T083 |
| 15 | C | 実践につながる内容（判断直前に使える道具） | E31、E33、E34 | なし | T084 |
| 16 | C | 演出を追加するときの指針（誘惑的詳細を避ける） | E17 | 不足ではなく予防 | T085 |
| 17 | D | 題材選び（検索需要・競合） | G11 | なし | T086 |
| 18 | D | 初日の反応を作る（公開時刻・告知） | G9 | 予約公開の設計のみ（T032） | T087 (human) |
| 19 | D | 一定の頻度で作れる量産体制 | G14（相関）、G9 | 1本ずつ手作業 | T088 |
| 20 | D | 長尺とショート動画の方針 | G13、G12 | なし | T089 (human) |
| 21 | D | シリーズ化・再生リスト・終了画面 | 査読研究なし（未確認） | なし | T090 |
| 22 | D | 想定視聴者層に合わせた見やすさ（高年齢層・TV視聴） | G32、G33 | 720p、文字サイズ固定 | T091 |
| 23 | D | 顔出し・アバターの判断 | E8、E9、E11、G7 | なし（必須ではない） | T092 (human) |

根拠の強さ:
- **強い**（査読・大規模・公式）: #1、#4、#5、#7、#9〜#13、推薦の仕組み（G1〜G3）。
- **弱い**（未査読・相関・業界）: 投稿頻度（#19）、ショート動画の影響（#20）、金融ジャンルのCPM、冒頭3秒の離脱率（ブログのみ）。

## 3. 文献A: 成長・収益化の要因（G番号）
### 推薦アルゴリズム
- **G1**: Covington, Adams, Sargin (2016) "Deep Neural Networks for YouTube Recommendations", ACM RecSys. https://research.google/pubs/deep-neural-networks-for-youtube-recommendations/ 【査読・本文確認】
  - ランキングの目的は「インプレッションあたりの期待視聴時間」。CTRでは欺瞞的な動画（クリックベイト）が上位に来るため、視聴時間で重み付けしたロジスティック回帰を使う。
  - 新しさは「Example Age」という特徴量で扱う。
  - アンケートを指標に使う記述はこの論文にはない。
- **G2**: Zhao et al. (2019) "Recommending What Video to Watch Next: A Multitask Ranking System", ACM RecSys. https://research.google/pubs/recommending-what-video-to-watch-next-a-multitask-ranking-system/ 【査読・本文確認】
  - エンゲージメント（クリック、視聴時間）と満足度（高評価、dismiss、アンケートの評価）の多目的学習。
  - MMoEでエンゲージメント+0.45%、満足度+3.07%。
- **G3**: Goodrow (2021) "On YouTube's recommendation system", YouTube公式ブログ。https://blog.youtube/inside-youtube/on-youtubes-recommendation-system/ 【公式】
  - 2012年に指標をクリックから視聴時間へ変えた直後、再生数は約20%減った。
  - アンケートで星4〜5を付けた視聴を「valued watchtime」とし、未回答は予測する。共有・高評価・低評価も満足度のシグナル。
- **G4**: YouTube "How YouTube Works: Recommendations"。https://www.youtube.com/howyoutubeworks/product-features/recommendations/ 【公式】
  - シグナルは視聴行動、高評価・低評価、満足度アンケート、チャンネルの評判と品質。
  - 新規チャンネルの扱い（コールドスタート）は未記載。
- **G5**: YouTube Help "Test & compare thumbnails"。https://support.google.com/youtube/answer/13861714 【公式・二次情報】
  - A/Bテストの勝者は視聴時間シェアで決まる。

### サムネイル・タイトル・CTR
- **G6**: Cui, Chung, Peng, Wang (2024) "Clicks for money", Journal of Business Research 183。https://scholars.ln.edu.hk/en/publications/clicks-for-money-predicting-video-views-through-a-sentiment-analy/ 【査読・抄録確認】
  - 16,215本。サムネイルの感情が強いと、ポジティブでもネガティブでも再生が増える。テキストの感情が強いと逆効果。タイトルはポジティブ表現が有利。
- **G7**: Bui et al. (2024) "Predicting YouTube success through facial emotion recognition of video thumbnails", Handbook of Social Computing。https://ideas.repec.org/h/elg/eechap/21469_7.html 【書籍章・抄録確認】
  - 顔の存在は成功と正の相関。笑顔の効果はカテゴリで逆転する。
- **G8**: Cremer (2017) PACIS。https://aisel.aisnet.org/pacis2017/186 【抄録確認】
  - 40万本でサムネイルの特徴と人気の関係を検証。数値は未確認。
- **G9**: Hoiles, Aprem, Krishnamurthy (2017) "Engagement and Popularity Dynamics of YouTube Videos and Sensitivity to Meta-Data", IEEE TKDE。https://arxiv.org/abs/1611.00687 【査読・本文確認】
  - 約600万本・2.5万チャンネル。再生数への影響が大きい特徴は、初日の再生数、登録者数、サムネイルのコントラストの順。
  - 公開後に変更して人気が上がった割合: タイトル52%、サムネイル53.3%、キーワード50%、無変更35%。
  - 約55%のチャンネルで、再生数が登録者数を先行して動かす（Granger因果）。
  - 投稿周期を外した投稿で、再生が増えた割合は97%（ゲーム中心の6,500チャンネル）。
- **G10**: Zannettou et al. (2018) "The Good, the Bad and the Bait", IEEE S&P Workshops。https://ieeexplore.ieee.org/document/8424634 【査読・抄録確認】
  - クリックベイトの検出と特性の分析（2018年時点）。
- 疑問形・数字入りタイトルの効果: 査読研究は見つからず、未確認。

### 投稿頻度・初期成長・ショート
- **G11**: Bärtl (2018) "YouTube channels, uploads and views", Convergence 24(1)。【査読・抄録確認】
  - 再生の平均85%が上位3%のチャンネルに集中する。ジャンルによっては若いチャンネルにも急成長の余地がある。
- **G12**: Rajendran, Creusy, Garnes (2024) "Shorts on the Rise", arXiv:2402.18208。https://arxiv.org/abs/2402.18208 【プレ・本文確認】
  - 250クリエイター。ショート動画を始めた後、長尺の再生数は平均74.4万回減った（p=0.011）。有意だったのは登録者500万人超の層だけ。情報・テック系は影響が小さい。前後比較で、因果推定ではない。
- **G13**: YouTube Help "YPP overview & eligibility"。https://support.google.com/youtube/answer/72851 【公式】
  - 登録者1,000人＋公開動画の視聴4,000時間/12か月、または登録者1,000人＋ショート視聴1,000万回/90日。
  - ショートフィードでの視聴時間は4,000時間に算入されない。
- **G14**: vidIQ (2026) upload frequency study。https://vidiq.com/research/youtube-upload-frequency-study/ 【業界・二次情報】
  - 投稿頻度が高い層ほど成長率の中央値が高い。相関であり因果ではないと、調査自身が明記している。

### 視聴維持
- **G15**: Wu, Rizoiu, Xie (2018) "Beyond Views", ICWSM。https://arxiv.org/abs/1709.02541 【査読・本文確認】
  - 530万本。動画の長さだけで平均視聴率の分散の58%超を説明する。同じ長さの中での「相対エンゲージメント」は安定していて、品質と相関する。
- **G16**: Park, Naaman, Berger (2016) "A Data-Driven Study of View Duration on YouTube", ICWSM。https://arxiv.org/abs/1603.08308 【査読・抄録確認】
  - 視聴時間は、再生数、高評価率、コメントの感情と関連する。
- **G17**: E1と同じ文献（Guo 2014）。
- **G18**: YouTube Help "Measure key moments for audience retention"。https://support.google.com/youtube/answer/9314415 【公式・二次情報】
  - 冒頭30秒の維持率は、タイトル・サムネイルとの一致を反映する。見どころは前に置く。

### AI生成・量産コンテンツ
- **G19**: YouTube Help "Channel monetization policies: Inauthentic content"（2025-07-15更新）。https://support.google.com/youtube/answer/1311392 【公式】
  - 量産的・反復的なものは収益化の対象外。例は、テンプレート化した画像スライドショー＋字幕、汎用テンプレートで量産したAI生成コンテンツ。
  - AIの利用は可だが、制作者の創作的ビジョンが必要。判定はチャンネル単位。
- **G20**: YouTube Help "Disclosing use of altered or synthetic content"。https://support.google.com/youtube/answer/14328491 【公式】
  - 現実と誤認しうる合成は開示が義務。制作補助としてのAI利用は不要。
- **G21**: Altay & Gilardi (2024) PNAS Nexus。https://doi.org/10.1093/pnasnexus/pgae403 【査読】
  - 4,976人。「AI生成」ラベルを付けると、真偽にかかわらず信頼と共有意向が下がる（虚偽ラベルの約1/3の効果）。原因は「完全に自動で作られた」という想定。見出しの研究で、動画ではない。
- **G22**: Li et al. (2025) "The Impact of AIGC Disclosure Policy on Video Consumption", ACIS。https://aisel.aisnet.org/acis2025/3 【抄録確認】
  - 開示ポリシーの導入後、AI生成動画の消費は全体に減った。ただし、ラベル付きの動画はラベルなしよりエンゲージメントが高い。
- **G23**: Kapwing (2025) "AI slop"レポート。【業界・二次情報】
  - 新規アカウントに表示されたショート動画の21%がAI slop。

### 金融ジャンル・CPM
- **G24**: YouTube Help「RPMとCPMの違い」。https://support.google.com/youtube/answer/9314357 【公式】
  - ジャンル別のCPMは公表されていない。
- **G25**: YouTube公式ブログ "YouTube Partner Program explained" (2025)。【公式】
  - 広告収益の分配は、長尺55%、ショート45%。
- **G26**: 金融ジャンルのCPM 15〜50ドルという数値（業界ブログ）。【業界・検証不能】参考値にとどめる。
- **G27**: Bradshaw, Koo, Zhao (2024) "Financial YouTube Channels and the Capital Markets"（UTSの討議用ワーキングペーパー）。【プレ・抄録確認】
  - 定量的な内容は情報の非対称性を下げる。73%が免責事項を掲示している。
- **G28**: Galarnyk et al. (2025) "VideoConviction", arXiv:2507.08104。【プレ】
  - 確信度の高い推奨はS&P500を下回った。
- **G29**: CFA Institute (2024) "The Finfluencer Appeal"。https://rpc.cfainstitute.org/research/reports/2024/finfluencer-appeal 【業界】

### エンゲージメントと日本市場
- **G30**: Chatzopoulou, Sheng, Faloutsos (2010) IEEE INFOCOM Workshops。【査読・二次情報】
  - 再生数・コメント数・評価数は互いに強く相関する。
- **G31**: Zhou, Khemmarat, Gao (2010) "The Impact of YouTube Recommendation System on Video Views", ACM IMC。【査読・二次情報】
  - 関連動画の推薦が主な流入元。比率の数値は未確認。
- **G32**: 総務省 情報通信政策研究所 (2025-06)「令和6年度 情報通信メディアの利用時間と情報行動に関する調査」。https://www.soumu.go.jp/main_content/001017159.pdf 【公式統計・本文確認】
  - YouTubeの利用率: 全体80.8%、50代83.0%、60代71.2%、70代43.3%。
- **G33**: Think with Google Japan "YouTube Recap 2024"。https://business.google.com/jp/think/search-and-video/youtube-recap2024-2/ 【公式】
  - 45〜64歳の2,740万人が利用（同世代の79%）。コネクテッドTVでの視聴時間は3年で2倍超。
- 日本の査読付きの成長要因研究: 見つからず、未確認。

## 4. 文献B: 解説動画の視聴維持・理解・信頼（E番号）
### 長さと分割
- **E1**: Guo, Kim, Rubin (2014) "How video production affects student engagement", ACM L@S。https://doi.org/10.1145/2556325.2566239 【査読・本文確認】
  - edX、690万セッション。視聴時間の中央値は、総尺に関係なく最大でも約6分。
  - 視聴後の問題回答率は、長さの区分で56%→31%に下がる。
  - 話速が速い（熱意と相関）ほど視聴時間が長く、最大2倍。顔とスライドの交互や手書き形式は視聴が長い。
  - 観察研究で、学習成果は測っていない。
- **E2**: Kim et al. (2014) "Understanding in-video dropouts and interaction peaks", L@S。https://doi.org/10.1145/2556325.2566237 【査読・抄録確認】
  - 視聴ピークの61%は画面の視覚的な切り替えと同時に起きる。長い動画ほど途中離脱が多い。
- **E3**: Brame (2016) "Effective educational videos", CBE—Life Sciences Education 15(4)。https://pmc.ncbi.nlm.nih.gov/articles/PMC5132380/ 【査読（レビュー）】
  - 信号化、セグメント化、不要要素の除去、会話調、熱意、埋め込み質問を推奨。
- **E14**: Rey et al. (2019) "A meta-analysis of the segmenting effect", Educational Psychology Review 31。https://doi.org/10.1007/s10648-018-9456-4 【査読・二次情報】
  - 56研究。保持・転移に小〜中程度の効果（d≈0.4、要照合）。
- **E5**: Szpunar, Khan, Schacter (2013) PNAS。https://doi.org/10.1073/pnas.1221764110 【査読・抄録確認】
  - 途中に小テストを挟むと、マインドワンダリングが減り、学習が向上する。

### 話し方・会話調・顔出し
- **E6**: Murphy et al. (2022) "Learning in double time", Applied Cognitive Psychology。https://doi.org/10.1002/acp.3899 【査読・抄録確認】
  - 1.5〜2倍速でも理解の低下は最小限。
- **E7**: Ginns, Martin, Marsh (2013) "Conversational style meta-analysis", Educational Psychology Review 25(4)。https://doi.org/10.1007/s10648-013-9228-0 【査読・二次情報】
  - 会話調の効果は、保持d=0.30、転移d=0.54。35分超の学習では効果が弱い。
- **E8**: Henderson & Schroeder (2021) Computers and Education Open 2。https://doi.org/10.1016/j.caeo.2021.100059 【査読・抄録確認】
  - 講師を画面に出すべきという一貫した証拠はない。満足度は上がりうる。
- **E9**: Alemdag (2022) Education and Information Technologies 27。【査読・二次情報】
  - 講師の顔出しは、学習への効果が有意でない。動機は上がるが、認知負荷も上がる。
- **E10**: Horovitz & Mayer (2021) Computers in Human Behavior 119。【査読・二次情報】
  - 楽しそうな講師は動機を上げるが、テスト成績の差はない。
- **E11**: Mayer & DaPra (2012) J. Exp. Psychol.: Applied。https://doi.org/10.1037/a0028616 【査読・抄録確認】
  - 身体表現のあるエージェントの効果は、人間の声のときだけ見られた。
- **E4**: Mayer, Fiorella, Stull (2020) "Five ways to increase the effectiveness of instructional video", ETR&D 68(3)。https://doi.org/10.1007/s11423-020-09749-6 【査読・二次情報】
  - 効果があるもの: 講師が描きながら説明する、視線の誘導、生成的な課題、一人称視点、第二言語向けの字幕。
  - 逆効果: 本筋と無関係な面白い映像。

### マルチメディア学習原理
- **E12**: Adesope & Nesbit (2012) "Verbal redundancy", J. Educ. Psychol. 104(1)。【査読・二次情報】
  - 57研究。ナレーションと同じ全文を出すより、キーワードを表示する方が有利な部分が大きい。
- **E13**: Schneider et al. (2018) "Signaling meta-analysis", Educational Research Review 23。https://doi.org/10.1016/j.edurev.2017.11.001 【査読・二次情報】
  - 信号化（強調）の効果は、保持g=0.53、転移g=0.33（要照合）。
- **E15**: Mayer, Mathias, Wetzell (2002) 事前学習の原理。J. Exp. Psychol.: Applied 8。【査読・二次情報】
  - 中央値d≈0.85（要照合）。
- **E16**: Schroeder & Cenkci (2018) Spatial contiguity, Educational Psychology Review。https://doi.org/10.1007/s10648-018-9435-9 【査読】
  - 図と文字を近くに置く効果はg=0.63。
- **E17**: Sundararajan & Adesope (2020) "Seductive details", Educational Psychology Review 32(3)。https://doi.org/10.1007/s10648-020-09522-4 【査読・二次情報】
  - 本筋と無関係な面白い情報は学習を下げる（g=−0.33）。

### 声（TTS）とAI生成
- **E18**: Mayer, Sobko, Mautone (2003) J. Educ. Psychol. 95(2)。https://doi.org/10.1037/0022-0663.95.2.419 【査読・抄録確認】
  - 機械音声より人の声の方が、転移テストの成績も話者の評価も高い。
- **E19**: Craig & Schroeder (2017) Computers & Education 114。【査読・抄録確認】
  - 現代のTTSは、人の声と同等以上の学習効果がある。
- **E20**: Craig & Schroeder (2019) J. Educ. Computing Research 57(6)。https://doi.org/10.1177/0735633118802877 【査読・抄録確認】
  - 現代のTTSと人の声は、ほとんどの指標で差がない。
- **E21**: Chiou, Schroeder, Craig (2020) Computers & Education 146。【査読・抄録確認】
  - 声の質は学習には影響しないが、信頼や知覚には影響する。
- **E22**: Dinçer (2022) Journal of Pedagogical Research 6(3)。【査読・本文確認・小規模】
  - TTSと人の声で、学習成果に有意差はない。
- **E23**: (2024) "Cute computer-synthesized voice hinders learning performance", Journal of Experimental Education。https://doi.org/10.1080/00220973.2024.2446169 【査読・抄録確認】
  - 人の声の方が学習と注意を高めた。
- **E24**: Netland et al. (2025) "Comparing human-made and AI-generated teaching videos", Computers & Education 224。https://doi.org/10.1016/j.compedu.2024.105164 【査読・本文確認】
  - 447人。AI動画は学習体験が−0.16点（5段階）。試験成績は差なし。
- **E25**: Xu et al. (2025) BJET 56。https://doi.org/10.1111/bjet.13530 【査読】
  - AI動画は保持で上回った。社会的存在感は録画動画が強い。
- **E26**: Zhang et al. (2025) Education and Information Technologies。https://doi.org/10.1007/s10639-025-13654-x 【査読・抄録確認】
  - 声もアバターもAIの組み合わせで、エンゲージメントが上がった。
- **E27**: G21と同じ文献（Altay & Gilardi 2024）。

### フック・物語・金融教育
- **E28**: Kang et al. (2009) "The wick in the candle of learning", Psychological Science。https://doi.org/10.1111/j.1467-9280.2009.02402.x 【査読・抄録確認】
  - 好奇心は記憶を強める。冒頭で問いを立てる根拠になる。
- 冒頭3秒〜30秒の離脱率: 教育動画での査読研究は見つからず、未確認（業界記事のみ）。
- **E29**: Mar et al. (2021) "Narrative versus expository texts meta-analysis", Psychonomic Bulletin & Review 28。https://doi.org/10.3758/s13423-020-01853-1 【査読・抄録確認】
  - 物語は説明文より理解・記憶されやすい（3.3万人超）。
- **E30**: Kaiser, Lusardi, Menkhoff, Urban (2022) J. Financial Economics 145(2)。https://doi.org/10.1016/j.jfineco.2021.09.022 【査読・二次情報】
  - RCT 76件。金融教育は知識と行動に正の因果効果がある。
- **E31**: Fernandes, Lynch, Netemeyer (2014) Management Science。https://doi.org/10.1287/mnsc.2013.1849 【査読・抄録確認】
  - 介入の効果は小さく、約20か月でほぼ消える。行動の直前に提供する教育（just-in-time）を提案。
- **E32**: Lusardi et al. (2017) "Visual tools and narratives", J. Pension Economics and Finance。https://doi.org/10.1017/S1474747215000323 【査読・本文確認】
  - 動画ナラティブで正答率+8〜10pt。文章より動画の方が高い。
- **E33**: Morewedge et al. (2015) "Debiasing decisions", Policy Insights from the Behavioral and Brain Sciences。https://doi.org/10.1177/2372732215600886 【査読・抄録確認】
  - 1回の介入でバイアスが減り、2か月後も持続した。ゲーム（練習とフィードバック付き）の方が動画より大きい。
- **E34**: Sellier, Scopelliti, Morewedge (2019) Psychological Science。https://doi.org/10.1177/0956797619861429 【査読・抄録確認】
  - 訓練を受けた人は、確証バイアスに沿った劣った解を選ぶ確率が19%低かった。
- **E35**: Kakhbod et al. (2023/2025) "Finfluencers", SFI 23-30。https://www.sfi.ch/en/publications/n-23-30-finfluencers 【プレ】
  - 逆スキルの発信者が56%で、彼らの方がフォロワーが多い。
- **E36**: IOSCO (2025) "Final Report on Finfluencers"。https://www.iosco.org/library/pubdocs/pdf/IOSCOPD795.pdf 【業界（規制当局）】
  - 開示の強化と教育を推奨。
- **E37**: CFA Institute (2024)。https://www.sec.gov/files/finfluencers-cfa-institute-0624.pdf 【業界・二次情報】
  - 開示率が低い。
- **E38**: Ontario Securities Commission "The rise of finfluencers"。https://www.osc.ca/en/investors/investor-research-and-reports/social-media-and-retail-investing-rise-finfluencers 【業界・二次情報】

### 字幕
- **E40**: Gernsbacher (2015) "Video captions benefit everyone", Policy Insights from the Behavioral and Brain Sciences 2(1)。https://doi.org/10.1177/2372732215602130 【査読（レビュー）・抄録確認】
  - 字幕は理解・注意・記憶を改善する。特に非母語話者や聴覚障害者に有益。
- **E41**: Montero Perez et al. (2013) System 41(3)。【査読・二次情報】
  - 第二言語の語彙習得に g=0.87。
- E12、E40、E4から導いた推論（未検証）: 字幕を切り替え式にすれば、冗長性による負荷とアクセシビリティを両立できる。

## 5. 未確認事項
- 疑問形・数字入りタイトルの効果。
- ジャンル別CPMの公式値・学術値。
- 日本市場の査読付き成長研究。
- 日本語TTSの評価研究。
- 冒頭数秒の離脱率。
- 一部の効果量（G6〜G8、E9、E13〜E15）。
- AI生成の解説動画を、YouTube上で視聴者がどう評価するかを直接扱った研究。
- YouTube API Services Developer Policiesの個別条項（T030でも未精読）。
- YouTube Analytics APIの仕様・クォータ・必要なスコープ（T076で調査する）。

## 6. 実装の基準にしたYouTube公式仕様（2026-10-08確認、T086の調査で取得）
- **チャプター**（https://support.google.com/youtube/answer/9884579）: 最初は00:00、昇順で3つ以上、各10秒以上。違反警告があるチャンネルなどでは使えない。
- **タイトル**（https://developers.google.com/youtube/v3/docs/videos）: 100文字まで、<と>は不可。
- **説明欄**: APIでは5000バイトまで（ヘルプは5,000文字）、<と>は不可。日本語は1文字3バイトが多い。
- **タグ**: 合計500文字。区切りのカンマと、空白を含むタグの引用符も数える。発見への寄与は小さい（公式）。
- **ハッシュタグ**（https://support.google.com/youtube/answer/6390658）: 60個を超えるとすべて無視される。
- **カスタムサムネイル**（https://support.google.com/youtube/answer/72431）
  - 推奨は3840×2160（16:9）、最小幅640px。JPGまたはPNG。
  - 容量はモバイル2MB、デスクトップとAPIは50MB。
  - 利用には電話番号の確認が必要（https://support.google.com/youtube/answer/171664）。
- **終了画面**（https://support.google.com/youtube/answer/6388789）: 動画の最後の5〜20秒、25秒以上の動画、要素は最大4つ、子ども向け動画は不可。
- 取得はWebFetchの要約経由のため、実装値として固定する前に原文を目視で確認すること。
