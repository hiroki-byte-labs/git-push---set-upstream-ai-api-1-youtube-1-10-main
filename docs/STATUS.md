# 現在の再開地点（2026-10-10 UTC、T099で整理）
2026-10-11 T110追記（Claude Code / claude-opus-5-5、001842-T110-da4a58fb）: 利用者の依頼でT099〜T111の作業ツリーをmainにコミットし、公開リポジトリのorigin/mainへプッシュ（ハッシュはgit log）。リポジトリ直下の利用者作成.zshrcは.gitignoreで除外し、手元に残した。
2026-10-10 T110 done（Claude Code / claude-opus-5-5、232110-T110-15494c02）: 参考動画の動きの解析とRemotionでの再現・比較の最小検証環境 `motion-lab/`（本体と独立。Remotion 4.0.534を固定、公式Agent Skillsを .agents/skills/remotion-best-practices に版固定で導入）。自作の10秒の合成動画で、正解照合67/67、再現の比較SSIM平均0.99939・動きの差は全図形で基準内。1回目の比較で見つけた5件の差異を修正。観測できない開始時刻・開始値は upper_bound/unknown で報告。次は本人が許可済みの参考動画とRemotionの利用形態を用意するT111（human、ready）。手順は motion-lab/README.md と .agents/skills/motion-reference-reproduction/SKILL.md。
2026-10-10 T108 done（Claude Code / claude-opus-5-5、174117-T108-699d0020）: 台本・合成音声・部分映像の比較資料 docs/T108-SERVICE-COMPARISON.md（公式資料12件、10/20分の想定費用、試聴手順と評価表、本人が決める項目）。契約・課金・試聴の生成はしていない。
**一括実装（T103/T104/T106/T108）の引継ぎは docs/BATCH-RESULT-2026-10-10.md。T103/T104/T108はdone、T106は本人の確認待ち（review）。本人への質問は同文書5章。**
2026-10-10 T106 review（Claude Code / claude-opus-5-5、171938-T106-2574f3e3）: 文字ずれを再現・修正（枠に対して中央配置、区画分け、文字配置の自動検査）、字幕の既定を焼き込みへ、集計の図・経緯の矢印の動き、サムネイル3案、構成案と83秒の試作。比較用は outputs/T106-review-2026-10-10/。本人の確認（構成・動き・サムネイル・字幕・文字ずれ）待ち。全191件/型検査成功。次はT108。
2026-10-10 T104 done（Claude Code / claude-opus-5-5、170507-T104-634ef8d4）: 本人の題材選択・考察・台本承認・動画承認を制作案件（`cli.ts produce`、確認画面の案件ページ）として実装。未入力・未承認では制作を拒否し、題材/考察/台本の変更で承認と古い動画が失効。sampleと既存ジョブはデモで本番に転用不可。全182件/型検査成功。本人の実際の選択・考察は未入力（本人の作業）。次はT106。
2026-10-10 T103 done（Claude Code / claude-opus-5-5、165146-T103-b861ec0b）: theme（general/investment）とintro（導入文）を台本へ追加し、テーマ別免責・概要欄の導入文と出典の構造化保存を実装。新テーマの無料サンプル fixtures/sample-general.json を隔離生成し実再生（音声は確認音）。全165件/型検査成功。次はT104（人の題材選定・考察・台本承認工程）。
2026-10-10 T109: T103/T104/T106/T108の一括実装依頼はdocs/CLAUDE-IMPLEMENTATION-BATCH.md。貼付用指示と23小単位、検証・中断・引渡し手順を用意。本体4件はreadyのまま。T106等で本人確認が残る場合はreviewとし、他作業を続ける。
2026-10-10 T107回答レビュー: T007/T089/T092はdone。無料ローカル改善を継続し、外部設定と投稿試験は保留。T106は所感改善、T108は課金なしのサービス比較でready。T025/T027/T029/T031は回答受領済みだが設定未完了のためbacklog。予算希望の適用範囲/確定額は未定で、現在の費用上限を変更していない。
2026-10-10 T092反映: 顔出し・アバターなし、説明用素材の候補はagentへ依頼する方針でdone。
2026-10-10 T089反映: 長尺のみで開始し、試作3本後に制作負担で見直す方針を確認してdone。
2026-10-10 T007再反映: 所感の記入を確認しdone。改善実装はT106（ready）へ分離。現行サンプルの品質承認ではない。以下の「所感未記入」は過去の状態。
2026-10-10 T105: 人待ちの質問式手順書はdocs/HUMAN-BLOCKERS.md。実接続の設定待ちと無料で進むT103/T104等を区別した。映像が任意という方針に対しT021/T022の依存が必須になっている点を明記し、保留時の分離はagentの後続作業とした。契約・課金・投稿は今回実行していない。
2026-10-10 T015反映: 初回コミット1d23465と、その内容のログ検査を別indexで確認しdone。全テスト152件/型検査成功。本人回答の反映結果はT070 done、T007 review（所感欄未記入）、T015 done。以下の補記は各作業時点の履歴。
2026-10-10 T007反映: 視聴完了の申告は受領済み。HUMAN-TASKSの所感欄が空のためreview。再視聴は不要で、所感の共有を待つ。テーマの希望はT070へ反映済み。
2026-10-10 T070反映: HUMAN-TASKS.mdの本人回答をdocs/CHANNEL-POLICY.md・仕様・prompt・設定へ反映してT070 done。正式名称は未決定。新テーマの生成経路はT103、人の選定・考察・台本承認工程はT104（ともにready）。既存fixture/lintは投資テーマのまま。以下のT102補記は反映前の時点記録。
2026-10-10 T102補記: 利用者がT070/T007/T015の完了を報告。初回コミット1d23465とdocs/HUMAN-TASKS.mdのT070回答を確認したが、3件のチケットはreadyのまま。T007の所感は文書内で未記入。結果の転記と不足所感の確認が次の記録作業。テーマ変更（投資中心から日常に結び付く知識へ）と人の考察・題材選定・承認の方針は実装未反映。T071/T084は依存完了だがbacklogなのでnextに出ない。今回の確認は本体修正・課金承認ではない。

状態の正本は `tickets/*.md`、次の作業は `./scripts/run src/cli.ts next` の出力。この節は現在の機能範囲と再開の手順だけを書き、チケットの一覧は手で持たない。区切り線より下の「過去の時点記録」は当時の状態で、そこにある次作業や「着手できるチケットはない」等は現在の指示ではない。

## 再開手順
```sh
export NODE_BIN=/path/to/node24        # PATHにNode 24以上がなければ（.node-version参照）
./scripts/run src/cli.ts check         # 未終了の作業記録や記録後の変更があれば失敗する
./scripts/run src/cli.ts next          # human / agent別の着手可能チケット
./scripts/run src/worklog-cli.ts start Txxx --agent 名前 --model モデル --model-source runtime|user-specified|unknown --request 依頼
```
コミット前は作業記録を閉じた後に `./scripts/verify`（check・全テスト・型検査）。手順の詳細はdocs/AGENT-WORKFLOW.md、全体像はdocs/HANDOFF.md。

## 機能の現状
- 実装済み（ローカル、外部API・課金なし）
  - 台本v2、制作前の安全検査（禁止表現、出典のない数値、最終場面の免責。サムネイルは描画する最終文言で検査）。
  - 描画・書出し・媒体検査、サムネイル3案、タイトル・概要欄（metadata.json）。
  - 確認画面と承認: 確認対象一式（動画、採用タイトル・概要欄・タグ・チャプター、字幕、サムネイル全案）の版に結び付き、変更で失効。T095より前の承認は「旧形式。再確認が必要」と表示。
  - 予算制御（プロセス内）: 見積り、上限（既定0 USD）、試行ごとの予約・精算、費用不明額の保持と再送の判定、照合の接続契約、job.json.attemptsへの全試行の記録。実接続がないため費用は常にmock/localの0 USD。
  - ジョブ管理: 一覧、中断の検出、abandon、退避（jobs clean。退避先が衝突したら何も移動せず拒否）。
- 未接続・未実装
  - 外部の実API（台本・音声・映像）とYouTube投稿（Publisherは無効）。
  - 予算の永続化・ジョブをまたぐ管理、実サービスでの費用照合と依頼IDの確認、冪等キーによる再送。
  - 無人運用（M5: 全停止、自動再開、通知、異常注入）。自然なナレーション（現在は確認音）。採用サムネイルの選択。
- 人の作業: humanのreadyチケットは `next` の「私が次に行う作業」に出る。優先度の高い3件（T070→T007→T015）の手順はdocs/HUMAN-TASKS.md。契約・課金・キー・投稿・pushは人の承認が必要。
- 注意: outputs/bias-check-demo-9233f7b6の承認記録は旧形式のためexpired表示になる（元々エージェントの動作確認で、人の承認ではない）。

## 直近の作業（2026-10-10 UTC、Claude Code / claude-opus-5-5）
T093レビューの指摘をdocs/CLAUDE-REPAIR-INSTRUCTIONS.mdの順に修正した。詳細と証跡は各チケットと作業ログ（logs/2026-10-10/）。
- T094 done（060200-T094-9f26d9ad）: jobs cleanは退避先の衝突時に何も移動せず拒否。途中失敗は移動済みの一覧を返す（docs/OPERATIONS.md）。
- T095 done（060418-T095-d391355f）: 承認を確認対象一式の版に結び付けた（ADR-015）。
- T096 done（060651-T096-906d6391）: サムネイルの最終文言（省略時の題名・promise）を描画と同じ関数で解決してlint。
- T097 done（060848-T097-1232c0b6）: 免責は文末の否定で判定し、ナレーションと字幕の両方に必要。最終場面の肯定の推奨・保証はerror。
- T098 done（061131-T098-577d7409）: 試行単位の予約、費用不明額の保持、照合、試行記録（ADR-016）。模擬接続のみで検証。
- T099 done（061341-T099-e2f9dee1）: README・STATUS・HANDOFFの現状と履歴を分離。全テストと型検査を最終実行。終了後の `scripts/verify` の出力は追補の作業回 070316-T099-0c508afd の証跡に保存。

---
# 過去の時点記録（当時の状態。現在の指示ではない）
## 時点記録: 人の作業の指示書（2026-10-10 UTC、T101）
あなたが行う上位3件（T070→T007→T015）の手順は docs/HUMAN-TASKS.md。回答はチャットに貼れば、エージェントが記録する。

## 時点記録: 修正作業の入口（2026-10-10 UTC、T100。T094〜T099は同日に修正済み）
Claude向けの共有指示書は docs/CLAUDE-REPAIR-INSTRUCTIONS.md。T094〜T099の最小作業・試験・記録手順を用意した。本体の修正はまだ行っていない。最新状態はticketsとnextで確認し、T094から1件ずつ進める。

## 時点記録: T093レビュー（2026-10-10 UTC。指摘はT094〜T099で修正済み）
Codex / GPT-6 Astra（user-specified）が後続実装を確認。テスト110件/型検査成功。ただし隔離再現で問題5件を確認したため、問題なしとは判断していない。本体修正は未実施。
- agent: T094（P1、整理で退避ファイルが上書きされる）を優先。T095（承認版）、T096（サムネイル代替文言検査）、T097（免責判定）、T098（再試行の不明費用）、T099（文書整合）もready。
- human: T007/T015/T070/T089/T092等。最新の依存状態は `cli.ts next` が正本。今回のレビューで契約・課金・投稿は承認されない。
- 証跡: logs/2026-10-10/010816-T093-a4a14a9f/evidence/REVIEW.md。Git初回コミット前のため、変更差分ではなく現コードと作業記録を照合。
- 以下は以前の時点記録を含む。T024一部完了やagent作業なし等は古い状態。文書全体の整理はT099へ。

## 時点記録: エンハンス一括実施（2026-10-08、Claude Code / claude-opus-5-5）
順序: T014→T041→T042→T043→T044→T024→T033→T016。全体の引き継ぎはT016でdocs/HANDOFF.mdに作る。
- T014 done: CLIの分割、.node-version、チケット検査、媒体の試験（T014の作業回ではSTATUSの更新が漏れたため、ここで記録する）。
- T041 done: 台本v2（src/plan.ts）、sample --plan、cueごとのVTT。v2のサンプルはfixtures/sample-v2.json。
- T042 done: 台本の安全検査（src/lint.ts、cli.ts lint、sampleの生成前検査）。
- T043 done: 図解4種、文字の自動縮小・はみ出し時の不合格、段階表示（src/timeline.ts、scripts/render.swift）。
- T044 done: 字幕の焼き込み/ソフト/両方、フレーム数の正確化（T043で生じた欠落も解消）、PSNR照合、LUFSの記録。
- T024 done: 台本・音声・描画を接続抽象＋予算（callWithBudget）経由で実行。job.json.usage[]と、USD建てのcostを記録。
- T033 done: 確認画面（一覧・詳細・承認/差戻し）、版に結び付く承認と失効、jobsとreviewのCLI、outputsの整理（_trash/_archiveへ移動）。9233f7b6の承認と14025babの差戻しはエージェントの動作確認用の記録で、人の確認ではない。
- T016 done: 引き継ぎ文書 docs/HANDOFF.md（全体像、データ形式、コマンド、不変条件、制約、記録の訂正、次の作業）。README、SPEC、DECISIONS（ADR-014）、ASSETS、T040を更新した。

## 時点記録: 収益化要件の調査（2026-10-08、T017）
docs/RESEARCH-GROWTH.mdに、根拠文献（確度・確認範囲つき）と不足23項目を保存し、T070〜T092を作成した。
- 最優先はT070（human）: 量産判定を避けるための独自性と、人が担う部分の方針。
- 他にhumanが決めるもの: T089（ショートの方針）、T092（顔出し）。T087は投稿の実装後。
- agentがすぐ着手できるもの: T072〜T075、T078〜T083、T085、T086、T091。
- 実接続や投稿の後に着手するもの: T071、T076、T077、T084、T088、T090。

## 時点記録: 収益化要件の実装（2026-10-08、Claude Code / claude-opus-5-5）
順序: T085→T075→T080→T081→T082→T083→T072→T074→T073→T078→T079→T091→T086。
- T085 done: docs/PRODUCTION-GUIDELINES.md（演出の指針）。
- T075 done: promiseとrole=hook、冒頭30秒の構成lint（3分以上はerror）。
- T080 done: chapter、recap/question、章のlint（6分目安）、第N章の表示、chaptersOf()。
- T081 done: example、beat、fictional。架空か出典つきかの区別（error）、「架空の例」の札。
- T082 done: 会話調のlint（語りかけの有無、である調30%超。warning）とprompt。
- T083 done: glossaryと、用語の後出し・未使用のlint（warning）。
- T072 done: config/channel.json（立場・利害関係・免責。未確定）、sources.txtとstance.txt、フッターの出典表示（番号への切り替えあり）。
- T074 done: metadata.json（タイトル案、概要欄、チャプター、タグ）、YouTube上限の検査、`cli.ts metadata`の見直し履歴、確認画面への表示。
- T073 done: サムネイル3案、コントラスト比・2MB・はみ出しの検査、見出しの禁止表現lint、確認画面への表示。
- T078 done: 字幕の既定をsoftに変更。emphasis（強調の札）と強調語のlint。v1の互換比較は--subtitles burnで行う。
- T079 done: 段階表示のフェード（1/3、2/3）と出現後1秒の縁取り強調。style.transitions=falseで無効にできる。
- T091 done: --resolution 1080。文字ごとの画素サイズとコントラスト比を記録し、見やすさを検査（16pt暫定、4.5）。スマートフォンとテレビでの確認手順。
- T086 done: docs/RESEARCH-TOPICS.md（データ源と規約上の制約）、題材候補表のひな型docs/templates/topic-candidates.csv。

## 時点記録: エンハンス後の状態（2026-10-08。現在の指示ではない）
- agentが着手できるチケットはない。次は人の作業: T007（視聴・方針）、T015（初回コミット）、T025/T027/T029/T031（契約・キー・上限額）。
- 人の作業が済めば、agentはT026、T028、T060、T032に進む。手順と注意はdocs/HANDOFF.mdの9章。
- 確認画面の承認・差戻しの記録のうち、9233f7b6と14025babはエージェントの動作確認で、人の確認ではない。

## 時点記録: 再開地点（2026-10-08 追記: T006/T020/T030/T023）
T006完了（組み込みブラウザーで実再生成功。スピーカー実聴はT007）。T020/T030完了（docs/RESEARCH-AI.md, RESEARCH-YOUTUBE.md）。T023完了、T024は一部（接続抽象・模擬・再試行まで。job.jsonへの配線が残件）。
- human: T007（視聴・方針）、T025（Gemini契約）、T027（音声選定・契約）、T029（Runway、保留可）、T031（YouTube設定）。契約・課金・キーは人の承認で実施。
- agent次: T024の残件。T026/T028/T060/T032は人のチケット完了後。T040/T050は前提完了後に分解。
- T021/T022は親チケット（子の完了で完了）。この端末のNodeは NODE_BIN=/Users/hongj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node を明示。

T012（2026-10-08）: 前回Codex実装のレビュー完了。指摘11件はlogs/2026-10-08/195411-T012-48e6feb0/evidence/REVIEW.md。修正はT013（agent ready）。T008の作業ログは定型生成で検証記録が不十分（成果のtsc エラー0は再確認済み）。

T013（2026-10-08）: T012の指摘を修正し完了。主な変更は次のとおり。
- job.jsonの接続種別をlocal.appkit-ffmpegに修正し、版を記録。
- finish時の同一本文・evidence実在の検査を追加。
- CRLFに対応し、ファイル名とidの一致を検査。
- AGENTS.mdに管理外スクリプトでの一括終了の禁止を追記。
- 一括検証のscripts/verifyを追加。
最新ジョブはreflection-demo-5c5ac021（内容は従来と同一）。

（以下は2026-10-08以前の記録）
2026-10-08。M0実装・文書整備とM1生成/自動検査は完了。実再生確認だけ未完了のためT006=review。これをdoneにするまでは今回の全完了条件達成と報告しない。

### 当時の次の作業（2026-10-08、M1時点。現在の指示ではない）
- human: T007。`./scripts/run src/cli.ts serve` または完成MP4を開いて再生し、字幕・映像・音声の所感を記録。今回は確認音のみで自然なナレーションなし。ブラウザー制御には保存済みの拒否設定がある。
- agent: T006の実再生再試験は権限設定解消後。独立して着手できるのはT020（AI接続の公式調査と具体化）、T030（YouTube制限と審査の調査）。今回のM0/M1範囲を越えて有料接続を始めない。
- T008は将来の静的型検査。M2以降は概要チケットで、実施前に分解する。

## コマンド
`./scripts/run src/cli.ts check` / `tickets` / `next`
`./scripts/run --test tests/*.test.ts`
`./scripts/run src/cli.ts sample`

## 出力
最新はoutputs/latest.json。完成品はoutputs/reflection-demo-7f46324e/sample.mp4。生成物はGit対象外。検証データだけdocs/verification-data.jsonに保存。Git初期化済み。外部pushなし。

Gitの署名者設定（user.name/email）は未設定のため、初回コミットは作成していない。ファイルは作業ツリーに保存済み。外部pushは行わない。利用者が必要ならローカルの署名者を設定してコミットする。

## 追跡ログの追加
2026-10-08: T009でlogs/を追加。記録者はCodex / GPT-6 Astra（ユーザー指定）。初回作業の回顧記録と今回のログ整備を区別し、依頼・変更・結果・TODOを保存。現在のチケット状態を変更するものではなく、T006の実再生は引き続き未確認。

## エージェント中立化と必須ログ検査（T010）
2026-10-08: ownerをhuman/agentに移行。Codex専用の自動Node探索を廃止しPATH/NODE_BINへ変更。worklog start/finish/checkとGit index対象のpre-commitを実装し、このcloneで有効化した。過去のログは当時の記録者を保持。

今回の端末はNodeが通常PATHにないため、操作時に `NODE_BIN=/Users/hongj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node` を明示して検証した。この端末情報は設定の自動既定値ではない。他環境は自身のNode 24以上を指定する。

再開時はdocs/AGENT-WORKFLOW.mdを読む。タスク終了にはログ本文とfinish/checkが必要。終了後変更があれば新しい作業回を作る。T006はreview、T007はready。新しいブラウザー再生・動画生成・有料実行は本作業で行っていない。

## 定型作業のSkill化（T011）
2026-10-08: `.agents/skills/routine-to-skill/` を共通原本として追加し、過去のT009/T010と今回の作業へ適用。反復する終了・引継ぎ作業を `repository-task-closeout` として抽出。終了前の候補評価をAGENTSに追加。個人環境のSkillコピーは配布先であり、原本更新時に同期が必要。既存の動画再生待ち等は変更しない。

## T008 / 2026-10-08
TypeScript 5.9.3/@types/node 24.10.0を固定導入。tsconfig.jsonとpnpm-lock.yaml、typecheckコマンドを追加。src/testsをstrict/noEmitで検査しエラー0。T006に依存せず実施できる理由をADR-011に記録。
残件: 動画の実再生は未確認。次はT020/T030の公式調査と具体化。
