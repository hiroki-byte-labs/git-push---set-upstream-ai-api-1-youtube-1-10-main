# 作業記録 T120
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-17T04:35:29Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
改善サイクルの継続。依頼は「改善を続けて下さい」。前回の再監査（logs/2026-10-17/030502-T120-af598b96）に続けて、制作の中核にあたるdoneチケットを抜き取りで再監査し、親が照合する。対象は承認・投稿（T124/T128/T129/T140）、音声（T125/T127/T138/T139）、Remotion（T126/T152〜T156）。この作業回は監査と照合まで行い、修正は各チケットの作業回で行う。

## 実施内容・変更ファイル
- 3分割した読取専用の子作業を `scripts/agentctl run` で並行実行した（delegation/task-{a,b,c}.json、指示は delegation/{common,a,b,c}.md）。
  - common.md は前回の指示を流用し、背景だけを前回の監査結果に差し替えた。
  - 予算の `max_total_tokens` はnullにした。前回の監査で、Gatewayが実行中にこの値を守らないと分かったため（選定時の見積りにだけ使われる）。
- 子の最終報告は、Claudeのセッション記録から抽出して delegation/result-*.md に保存した。
- 親の照合結果を evidence/audit-summary.md にまとめ、docs/STATUS.md へ追記した。コードとチケットは変更していない。

## 判断と理由
- 前回は13件中5件で実害が見つかった。そこで、本人工程・媒体検査・描画という公開物の品質と承認に直結する範囲を選んだ。
- 修正の優先順位: 本人工程を名前の省略で通れる問題（方針の根幹、AGENTS/CHANNEL-POLICY）を最優先にする。次に欠測を合格にする検査（可読性・同期）、最後に回帰検出の欠落（verify）。
- 構造上の未接続（T128/T127の検査を制作経路へ載せること、T124の素材照合）は、方針・設計の判断を含む規模の作業になる。今回は記録にとどめ、修正の後で切り出しを検討する。
- 定型作業評価: 「委譲監査→子の出力をセッション記録から抽出→親照合」はこれで2回目。抽出の手作業は agentctl に出力保存がないことが原因で、保護対象の改修候補として残す（Skill化よりツールの改善が適切）。

## 検証コマンド・結果・証跡
- `agentctl plan` の結果は3件とも claude-sonnet-5-5 / validation ok。`agentctl run` は3件とも終了0。`status --require-metered` も3件とも終了0（evidence/child-metering.txt、総トークンは 981630 / 974381 / 1647061）。
- 親の確認:
  - `isAgentName` の実測: cli-user false / local-user false / assistant false / Magenta true / claude-code true。
  - src/cli.ts の `--reviewer` 既定値 cli-user と、serve.ts の既定値 local-user をコードで確認した。
  - `checkReadability` は、空の render-report で ok:true を返した（node で再現）。
  - `cd motion-lab && node --test tests/*.test.ts` は 33 / pass 33 / fail 0、終了0。`scripts/verify` には motion-lab の実行がないことを確認した。
  - `./scripts/run --test` を motion-lab の中で使うと、run がリポジトリのルートへcdするためパスが解決できず終了1になる。node を直接使えば実行できる。
- `checkSubtitleSync` の NaN は、子の再現とコード上の根拠で判断した。親は再現していない。

## 未実施・制約
- T125/T152〜T154/T156 の「問題なし」と、T126/T138/T139/T155 の軽微判定は子の報告による。親は深掘りしていない。
- 実Remotion・実音声での再生成はしていない。
- 親対話の計測は、作業回の終了時点でmissing（running）。

## TODO・再開方法
修正は次の順で行う。各回とも、回帰試験を先に置いてから修正し、verify と記録を行う。
1. T104: 本番の動画承認で既定名を拒否し、名前判定の誤拒否を直す。
2. T158: checkReadability の空・欠測を不合格にする。
3. T127: 同期検査の非有限値を不合格にする。
4. T013: verify に motion-lab の試験を加える。
