# 引き継ぎ: エンハンス一括実施（2026-10-08）
- 記録者・実施者: Claude Code / claude-opus-5-5（runtime）
- 対象チケット: T014、T041、T042、T043、T044、T024（残件）、T033、T016。人の作業としてT015を追加した。
- この文書は**2026-10-08時点の要約と、その後の追補**。現在の状態の正本は `tickets/*.md` と `./scripts/run src/cli.ts next`、現在の機能範囲は `docs/STATUS.md` の先頭。本文中の「次の作業」は当時のもの。各作業の詳細と証跡は「8. 作業ログ」の各ディレクトリにある。
- 2026-10-10のレビュー修正（T094〜T099）で変わった点は末尾の「追補: レビュー修正」と、本文中のT095〜T098の注記。

## 0. 最初に読む順番
1. `AGENTS.md`（共通規約）と `docs/AGENT-WORKFLOW.md`（開始→記録→終了の手順）。
2. この文書。
3. `docs/STATUS.md` の先頭（現在の再開地点と機能の現状）。
4. `./scripts/run src/cli.ts next` で着手できるチケットを見る。

再開の最短手順:
```sh
# この端末ではNodeがPATHにない。自分の環境のNode 24以上を指定する（.node-version参照）
export NODE_BIN=/path/to/node24
./scripts/verify                       # check・全テスト・型検査
./scripts/run src/cli.ts next
./scripts/run src/worklog-cli.ts start Txxx --agent 名前 --model モデル --model-source runtime --request 依頼
```

## 1. 何が変わったか（チケット別）
| チケット | 要点 | 主なファイル |
|---|---|---|
| T014 開発基盤 | CLIをコマンド別に分割。.node-versionを追加。チケットの空の節と「doneなのに結果未実施」を拒否。FFmpegを使う媒体の試験 | src/cli.ts、src/commands/*、src/tickets.ts、tests/media.test.ts |
| T041 台本v2 | schema 2: ナレーション、字幕cue、図解4種、出典、総尺25分まで。v1は自動変換。`sample --plan` | src/plan.ts、fixtures/sample-v2.json |
| T042 安全検査 | 禁止表現（保証、推奨、銘柄特定、煽り）、出典のない数値、最終場面の免責（T097以降はナレーションと字幕の両方に、推奨・保証を否定する文が必要。肯定文はerror）。`lint`コマンド。sampleは描画前に停止する | src/lint.ts |
| T043 描画 | 図解4種（flow、compare、number、branch）。文字を計測して縮小し、収まらなければ不合格。図解の段階表示と字幕cueで区間を切る | src/timeline.ts、scripts/render.swift |
| T044 字幕と媒体検査 | `--subtitles burn|soft|both`。フレーム数を正確化。描画画像とのPSNR照合。LUFSの記録 | src/media.ts |
| T024 残件 | 台本・音声・描画を接続抽象＋予算で実行。job.jsonにusage[]（mock/local/real）とUSD建てcost。`--budget-usd` | src/connections.ts、src/commands/sample.ts |
| T033 確認画面とジョブ管理 | 版（T095以降は確認対象一式のSHA-256）に結び付く承認と差戻し、変更で失効。一覧・詳細の画面、POSTの検査。`jobs`/`review` CLI。outputsの退避 | src/review.ts、src/jobs.ts、src/commands/serve.ts |
| T015（human） | Gitの作成者設定と初回コミット。エージェントは実施しない | tickets/T015.md |

## 2. 制作の流れ（`cli.ts sample`）
```
台本ファイル(v1/v2) ──loadPlan──▶ Plan v2
  │  callWithBudget(script, mock)                     … usage[0]
  ├─ plan.json
  ├─ lintPlan ─▶ lint.json（errorならfailedで停止。音声・描画に進まない）
  ├─ subtitles.vtt（cue単位・ミリ秒）
  ├─ callWithBudget(audio, mock) ─▶ audio.wav         … usage[1]
  └─ callWithBudget(visual, local)                    … usage[2]
       ├─ buildSegments ─▶ segments.json（段×cueの区間、フレーム整数）
       ├─ buildRenderSpec ─▶ render-spec.json
       ├─ work/render（Swift）─▶ 区間PNG、scene-N.png、render-report.json（はみ出しならexit 1）
       └─ encode ─▶ sample.mp4 ＋ media-check.json
            （フレーム数一致、ソフト字幕、確認音、PSNR、LUFS）
job.json: status、usage[]、cost、lint、versions、pid、outputHash …
review.json: 承認・差戻しの履歴（serve / cli.ts review）
```

## 3. データ形式の要点
- **Plan v2**（src/plan.tsのLIMITSが上限の正本）
  - `{schema: 2, id, title, version, sources: [{id, title, url(https), accessedAt}], scenes: [...]}`
  - 各場面は`{title, narration, cues: [{text, seconds}], diagram, sources: [id], seconds(整数)}`。
  - cueの秒数の合計は場面の秒数と一致させる。ナレーションは秒数×9字まで。
  - diagramは`flow{items 2〜4}`、`compare{left, right, leftItems, rightItems}`、`number{value, label, note?}`、`branch{question, yes, no}`のいずれか。
- **job.json**（新しい欄）
  - `input`、`durationSeconds`、`subtitles`、`pid`
  - `versions{planSchema, plan, rendererSource, ffmpeg, node}`
  - `lint{ok, errors, warnings}`
  - `usage[{domain, provider, model, mode, requestId, inputUnits, outputUnits, costUsd, attempts}]`（成功した呼出しだけ）
  - `attempts[{attemptId, domain, provider, mode, attempt, at, estimateUsd, outcome, charge, costUsd?, providerRequestId?, error?}]`（T098。失敗を含む全試行。attemptIdはローカル識別子、providerRequestIdは接続先の依頼ID。chargeはconfirmed/none/unknown/reconciled）
  - `cost{currency: 'USD', limit, committed, reserved, unknown}`（unknown=費用不明の試行の保持額。T098以降）
  - 旧ジョブのcostはJPY形式のまま残っている。
- **media-check.json**: `expectedFrames/videoFrames`、`subtitles`、`subtitleStreams`、`psnr{minDb, threshold: 30, checked, segments}`、`loudness{integratedLufs, truePeakDbfs}`。
- **review.json**: `[{decision, note, outputHash, bundleHash, inputHash, at, reviewer}]`。最後の記録が状態を決める。bundleHashは確認対象一式の版（T095）。ないものは旧形式で、再確認が必要と表示する。

## 4. コマンド早見表
```sh
./scripts/run src/cli.ts lint [--plan 台本.json]
./scripts/run src/cli.ts sample [--plan 台本.json] [--subtitles burn|soft|both] [--budget-usd 0]
./scripts/run src/cli.ts serve          # http://127.0.0.1:4173/ 一覧→詳細→承認/差戻し
./scripts/run src/cli.ts jobs           # 一覧（中断の疑いも表示）
./scripts/run src/cli.ts jobs abandon <id> --note 文
./scripts/run src/cli.ts jobs clean [--apply]   # 既定は表示のみ。移動のみで削除しない
./scripts/run src/cli.ts review <id>    # 状態と現在の版
./scripts/run src/cli.ts review <id> approve|reject --hash <版> --note 文 --reviewer 名前
./scripts/verify                        # コミット前の一括検証
```

## 5. 変更するときに壊してはいけないこと（不変条件）
1. **v1の見た目の互換**: `fixtures/sample.json`を`--subtitles burn`で生成したscene-1〜6.pngは、M1のジョブreflection-demo-7f46324eとバイト単位で一致してきた（T078で字幕の既定がsoftになったため、比較には`--subtitles burn`を付ける）。描画を変えたら`cmp`で確認し、意図して変えたなら記録する。
2. **フレームは整数**: 区間はフレーム単位（24fps）。書出しは`fps`、`tpad`、`-frames:v`を組み合わせる。旧来の`-r 24`だけの方式に戻すとフレームが欠落する（T044で確認）。
3. **安全検査は費用の前**: lintは音声・描画（将来は有料API）より前に置く。
4. **承認は確認対象一式の版に結び付く**: 動画・採用タイトル・概要欄・タグ・チャプター・字幕・サムネイル全案から`reviewBundle`/`bundleHash`（src/review.ts）で版を計算し、表示した版と一致するときだけ記録する。どれかが変われば失効する。承認時と判定時は同じ計算を使う。投稿予定の項目を増やしたら一式に加える（T095）。Publisherは無効のまま。
5. **mock/local/realを区別する**: 模擬を実接続の成功として記録しない。実接続を加えるときはmode='real'にし、見積りをcallWithBudgetに渡す。上限の既定は0 USD。
   - **費用不明を無料扱いしない（T098）**: 予約・精算は試行ごと。失敗はConnErrorのchargeで「none（確実に未処理）」と「unknown（既定）」を分け、unknownは予約をBudget.unknownに保持して次の再送の判定に含める。429/5xxのコードだけでnoneにしない。照合（Connection.reconcile）で費用が判明したら一度だけ確定する。実接続を作るときは、接続先が未処理を保証する場合だけnoneを返し、依頼IDをproviderRequestIdに入れる。冪等キーによる再送無課金の扱いは、接続先の仕様で根拠を確認してから別途実装する（未実装）。
6. **outputsは削除しない**: 退避は_trash/_archiveへの移動。生成物・動画・秘密はGitにもログにも入れない。
7. **作業記録**: 1チケット1作業回。finishの前にチケット、STATUS、WORKLOG、証跡を揃える。Git管理外のスクリプトで一括終了しない（AGENTS.md）。

## 6. 既知の制約・未実施
- 音声は確認音のみで、ナレーションは未接続（T027/T028）。LUFSは記録だけで基準は未設定。
- 段階表示の切替は瞬時（補間なし）。文字の縦方向の中央揃えはない。
- 安全検査は正規表現。意味の理解・法令適合は保証しない。漢数字の割合（「五割」など）は検出しない。
- PSNRは各区間の中央1フレームを照合する。切替時刻の1〜2フレームのずれは検出できない。
- 確認画面は本人確認なし（ローカル単独利用の前提）。ボタンのブラウザー操作は未実施で、同じPOSTをcurlで確認した。
- 長尺（20分）での実行時間は未測定。
- チケットの状態遷移の検査は未実装。Git履歴ができてから（T015の後に）再検討する。
- Windowsでの実機確認はしていない（CRLFは単体試験のみ）。

## 7. 記録の訂正・注意（過去ログは改変していない）
- **T043のフレーム数**: T043の記録の「1152フレーム」は区間計算の合計。実際の動画はT043の方式で1066フレームだった。T044で原因を特定して修正した（logs/…T044…/WORKLOG.md）。
- **T014のSTATUS更新漏れ**: T041の作業回でSTATUSに追記した。
- **エージェントによる確認記録**: outputs/bias-check-demo-9233f7b6の承認と14025babの差戻しは、Claude Codeの動作確認で、人の確認ではない（reviewerはlocal-user/cli-user）。公開判断に使わない。
- **outputsの移動**: M1初期の失敗ジョブ4件とlint-ng-demoをoutputs/_trash/へ、Codex時代の引き渡しファイル8件をoutputs/_archive/2026-10-08/へ移した。
- **Codexの過去記録**: T008のログが定型生成だった件などはT012のレビュー（logs/…T012…/evidence/REVIEW.md）を参照。

## 8. 作業ログ（UTC、logs/2026-10-08/）
| チケット | ディレクトリ | 主な証跡 |
|---|---|---|
| T014 | 201018-T014-88f3c2d9 | evidence/verification.txt |
| T041 | 201216-T041-9f9d938d | evidence/verification.txt |
| T042 | 201429-T042-344c5ddb | evidence/verification.txt |
| T043 | 201552-T043-cbc47a86 | evidence/verification.txt、v2-scenes.png、v2-steps.png、v2-branch-fixed.png |
| T044 | 201926-T044-8be9ad66 | evidence/verification.txt、burn-vs-soft.png |
| T024 | 202302-T024-dcca2f1c | evidence/verification.txt |
| T033 | 202425-T033-13d3f3aa | evidence/verification.txt、clean.txt、review.txt |
| T016 | 202817-T016-3103d27b | evidence/handoff-walkthrough.txt |

## 9. 次の作業（2026-10-08時点の記録。現在は `cli.ts next` が正本）
- **human**
  - T007: 試作の視聴と方針決定。v2のbias-check-demoも確認画面で見られる。
  - T015: 初回コミット。
  - T025/T027/T029/T031: 契約・キー・上限額の設定。秘密値は貼らない。
- **agent**
  - T026（Gemini台本）、T028（音声）、T060（Runway）、T032（投稿）は、人の作業の完了後に着手できる。
  - 実接続はmode='real'のConnectionとして実装する。見積りにはsrc/budget.tsを使い、台本の出力はPlan v2（validatePlanV2とlintPlanを通す）にする。
- 親チケットT040（M4）のうちローカルで完結する部分はT041〜T044で実施した。残りの複数ジョブ、同時数制限、素材管理、辞書、部分再生成は未着手。

---
# 追補: 収益化要件の実装（2026-10-08、T085、T075、T080〜T083、T072〜T074、T078、T079、T091、T086）
根拠はdocs/RESEARCH-GROWTH.md（文献のG/E番号）、各作業の詳細はlogs/2026-10-08/の各作業ログ。

## A. 台本v2に追加した任意欄（src/plan.ts。v1は従来どおり変換される）
| 欄 | 内容 | チケット |
|---|---|---|
| `promise` | この動画で得られること（40字） | T075 |
| `scene.role` | hook、body、recap、question、example、glossary | T075、T080、T081、T083 |
| `scene.chapter` | 章名（全場面に付け、同じ章は連続させる） | T080 |
| `scene.beat` / `scene.fictional` | 物語の流れ（situation→conflict→insight→lesson）と、架空の例の表示 | T081 |
| `glossary` | 用語と説明 | T083 |
| `scene.emphasis` | 強調語（1〜3語） | T078 |
| `thumbnail` | サムネイルの見出し・補足・使う場面。省略時は見出し=題名、補足=promise（`thumbnailText`、描画とlintで共通。T096） | T073 |
| `style.transitions` | falseでフェードと強調を止める | T079 |

## B. 追加した検査（src/lint.ts）
- **本番尺（3分以上）ではerror、試作ではwarning**: promise、hook（冒頭30秒以内、問いを含む）、章立て、物語・具体例の有無。
- **常にerror**: 具体例・状況・葛藤の場面は「fictional」か「出典つき」にする。サムネイル（省略時に代替される題名・promiseを含む、描画する最終文言。T096）とタイトルの禁止表現。
- **warning**: 章の長さ（6分）、章ごとのまとめ・問い、「例えば」の未指定、物語の順序、会話調、用語の後出し、強調語の不一致。

## C. 追加した出力（outputs/<job>/）
- `sources.txt` / `stance.txt`: 概要欄用の出典と立場。立場はconfig/channel.jsonにあり、**T070で確定するまでdecided=false（公開禁止の注記が付く）**。
- `metadata.json` / `metadata-revisions.json`: タイトル案、概要欄、チャプター、タグと、公開後の見直し履歴（`cli.ts metadata`）。YouTubeの上限で検査する。
- `thumbnail-{a,b,c}.png` / `thumbnails-report.json`: サムネイル3案と、コントラスト比・2MBの検査。
- `render-report.json`: 文字ごとの画素サイズとコントラスト比。job.json.readabilityで判定する（16pt暫定、4.5）。

## D. 既定の変更と不変条件の更新
- 字幕の既定はsoft（切り替え式）。v1の見た目の互換確認は`--subtitles burn`で行う（本書5章の1を更新済み）。
- 段階表示はフェード（1/3、2/3）と、出現後1秒の縁取りが既定。完成状態の画像（scene-N.png）は従来と同一。
- 1080pは`--resolution 1080`（論理座標×1.5）。既定は720p。

## E. 文書
- docs/PRODUCTION-GUIDELINES.md: 演出の指針（T085）。
- docs/RESEARCH-TOPICS.md、docs/templates/topic-candidates.csv: 題材選び（T086）。
- prompts/script.md: 台本生成の構成条件（冒頭、章、物語、会話調、用語）。
- docs/OPERATIONS.md: 見やすさの確認手順（T091）。

## F. 注意（エージェントによる記録）
- chaptered-demo-85d86771のタイトル見直しは、エージェントの動作確認で、実データに基づく見直しではない（by=Claude Codeと記録した）。

---
# 追補: レビュー修正（2026-10-10、T094〜T099、Claude Code / claude-opus-5-5）
T093のレビュー（logs/2026-10-10/010816-T093-a4a14a9f/evidence/REVIEW.md）の指摘を、docs/CLAUDE-REPAIR-INSTRUCTIONS.mdに沿って1チケットずつ修正した。各チケットに方針・試験・証跡がある。

| チケット | 変更 | 主なファイル |
|---|---|---|
| T094 | jobs cleanは退避先（_trash、_archive/<日付>）に同名があれば何も移動せず拒否。途中失敗は移動済みの一覧を返す | src/jobs.ts、tests/jobs.test.ts、docs/OPERATIONS.md |
| T095 | 承認を確認対象一式（動画、採用タイトル・概要欄・タグ・チャプター、字幕、サムネイル全案）の版に結び付けた。画面・CLIは一式の版を送る。旧形式の承認は再確認が必要 | src/review.ts、src/commands/serve.ts、src/cli.ts、tests/approval.test.ts、ADR-015 |
| T096 | サムネイルの最終文言（省略時は題名・promise）を`thumbnailText`で解決し、描画とlintの両方で使う | src/plan.ts、src/timeline.ts、src/lint.ts |
| T097 | 免責は「推奨」「保証」を含む文の文末が否定かで判定。ナレーションと字幕の両方に必要。最終場面の肯定文はerror | src/lint.ts、prompts/script.md |
| T098 | 予約・精算を試行単位にし、費用不明（ConnError.charge=unknown、既定）の予約を保持して再送を判定。照合（reconcile）と全試行の記録（job.json.attempts、cost.unknown） | src/connections.ts、src/budget.ts、src/commands/sample.ts、ADR-016 |
| T099 | README・STATUS・本書の現状と履歴を分離 | README.md、docs/STATUS.md、docs/HANDOFF.md |

新しい不変条件は本書5章の4（承認は一式の版）と5（費用不明を無料扱いしない）に追記した。実接続（T026/T028/T060/T032）を作るときは、5の注意に従ってchargeとreconcileを実装する。
