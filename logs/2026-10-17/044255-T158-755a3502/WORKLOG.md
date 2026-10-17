# 作業記録 T158
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-17T04:42:55Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T120再監査（043529）で確認した不具合を修正した。checkReadability が、次の3種類の記録を合格にしていた。
- 空の render-report
- 全件が readabilitySample:false の記録
- pixelSize・contrast が欠測した記録

利用者の依頼「改善を続けて下さい」の範囲内の作業。

## 実施内容・変更ファイル
- `src/readability.ts`:
  - 配列でないレポートは例外にした。
  - 判定に使える記録がない場合と、測定値が有限でない記録がある場合は issue を出して不合格にした。
  - 最小値の集計は、有効な記録だけで行う。
- `tests/readability-gate.test.ts`: 回帰試験を1件追加した（欠測5種と正常系）。
- `tickets/T158.md` と `docs/STATUS.md` を編集ツールで更新した。status は review のまま。

## 判断と理由
- この検査は、「見やすさが測れていること」を前提に合格を出している。測れていない状態での合格は、T158 の「可読性失敗を公開候補にしない」に反する。そのため欠測は不合格にした。
- Remotion 経路はもともと validateCoverage で記録の存在を保証している。今回の修正は native 経路と将来の描画経路を守るためのもの。
- 実描画のレポートが新しい条件を満たすことを確かめるため、隔離コピーで native の sample を実生成した。
- 定型作業評価: 新しい Skill の候補はない。

## 検証コマンド・結果・証跡
- 修正前: `./scripts/run --test tests/readability-gate.test.ts` は pass 4 / fail 1、終了1（空の記録で ok=true。evidence/before-fix.txt）。最初の版の試験では ESM に require を書いてしまったため、削除してから保存した。
- 修正後: `./scripts/run --test tests/*.test.ts` は 439 件中 pass 439 / fail 0、終了0（evidence/after-fix.txt）。`tsc --noEmit` は終了0。
- 隔離生成の手順:
  - `git ls-files`（logs を除く）を scratchpad へ展開した。
  - 修正後の readability.ts を置き、node_modules と work/python-deps（ffmpeg）はリンクした。
  - `./scripts/run src/cli.ts sample` は終了0。job.json は completed で、readability は ok:true、minFont720 17、minContrast 6.32（evidence/isolated-sample.txt）。
- 元のリポジトリの `git status` を確認し、変更が意図した2ファイルとこのログだけであることを確かめた。

## 未実施・制約
- Remotion 経路の実生成は行っていない（validateCoverage があり、今回の変更による挙動の差は記録が欠けたときだけ）。
- 札（架空・考察）と illustration ラベルが文字配置の網羅に含まれていない点（再監査の軽微指摘）は、今回は対応していない。

## TODO・再開方法
- 次は T127（checkSubtitleSync の非有限値）。その後 verify に motion-lab の試験を加える。
