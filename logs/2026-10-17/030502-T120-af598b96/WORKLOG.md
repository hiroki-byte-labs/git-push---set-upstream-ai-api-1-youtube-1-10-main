# 作業記録 T120
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-17T03:05:02Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
Antigravityがdoneにした T160〜T176 の抜き取り再監査（主張と実装・試験の一致、隔離再現）。確認した不具合はチケット化し、改善サイクルで1件ずつ修正する。利用者の依頼: 「issue-to-improvementで改善サイクルを回して。未コミット差分の整理と、Antigravityが完了にしたT160〜T176の抜き取り再監査から始めて。」この作業回は監査と照合まで。修正は各チケットの追加作業回で行う。

## 実施内容・変更ファイル
- 直前のT176作業回の終了後、滞留差分を `269893e` として1コミットした（pre-commitの check --staged 成功、git status クリーン、push未実施でoriginより3コミット先行）。
- 監査範囲を3分割し、読取専用の子作業を `scripts/agentctl run` で並行実行（delegation/task-{a,b,c}.json、指示 delegation/{common,a,b,c}.md）。a=T160〜T166、b=T167/T169/T173、c=T172/T174/T168。T170/T171/T175は前回Codexが再監査・修正済み、T176は直前に自分で扱ったため除外。T177は範囲外。
- Gatewayは子の出力本文を保存しないため、各子のClaudeセッション記録（~/.claude/projects 配下、session_idはagentctl statusのsession_ref）から最終報告だけを抽出して delegation/result-{a,b,c}.md に保存した。
- 親が要修正の指摘をコードと最小再現で照合し、evidence/audit-summary.md にまとめた。docs/STATUS.md に再開地点を追記。チケット本文・コードは変更していない。

## 判断と理由
- 既存チケットの不具合は、skillの規定どおり新規起票せず各チケット（T165/T166/T172/T173/T174）の追加作業回で直す。T167はreviewのまま表記を訂正する。
- 修正順は誤成果・誤承認を先にした: T174（壊れたVTTを出力）、T172（別ジョブを誤った台本で描画しcompleted）、T165/T173（品質ゲートが欠測・衝突を合格）、T166（差替え画像を古い合格で承認）。
- 修正は各回とも数ファイルで、同じファイル群（thumbnails.ts / review.ts / sample.ts）に順に触るため、並行委譲すると同時編集と作業回の混在が起きる。修正は親が順に行い、監査の切り出し可能な部分だけを委譲した。
- 定型作業評価: 子の出力本文の回収（セッション記録からの抽出）は今回初めて手作業で行った。agentctl本体（保護対象）に出力保存がないことが原因で、Skill化よりagentctlの改善が適切。候補として残し、今回はSkill化しない。

## 検証コマンド・結果・証跡
- 開始時 `cli.ts check` 成功（T176終了後、155 tickets / 165 sessions）。
- `agentctl plan` 3件とも claude-sonnet-5-5 / subscription / validation ok。`agentctl run` 3件とも終了0・completed。`agentctl status <task> --require-metered` 3件とも終了0・measured（evidence/child-metering.txt、総トークン 478174 / 992697 / 1042894）。
- 親の照合: src/thumbnails.ts の checkThumbnails（swiftのok/issues不参照、縮小PNG欠落時は測定なし）、src/review.ts:151-181（記録値だけで判定）と sample.ts:241-243（画像hashなし）、src/queue-adapter.ts:64-90（sample経路は defaultOpts を実行）、`splitCues` の改行保持を node で再現（evidence/parent-t174-newline.txt。cueに "\n\n" が残る）と optimizeSubtitleLines の呼出しが再エクスポートのみ（同ファイル）。
- 子は scratchpad や /tmp で再現を行ったと報告。親は子の再現スクリプトを再実行していない（T172の取り違え・再描画不可、T165の書換え再現、T173の欠測再現は子の報告に基づく。コード上は親も一致を確認）。

## 未実施・制約
- T160〜T162・T168の「問題なし」とT163/T164/T169の軽微判定は子の報告で、親は深掘りしていない。
- 子のトークン消費は max_total_tokens 300000 を超えた（キャッシュ読込を含む総量と思われる）が、Gatewayは停止しなかった。上限の数え方・強制はT121系の確認事項として残す（今回は未調査）。
- Gatewayが子の出力を保存しない点は未改善（保護対象のため別作業）。
- 親対話の計測は終了時点でmissing（running）。

## TODO・再開方法
- T174 → T172 → T165 → T173 → T166 の順に、各チケットで worklog start → 回帰試験を先に追加して失敗を保存 → 修正 → 対象試験と ./scripts/verify → チケット・STATUS更新 → finish → check。T167は文書の表記訂正。
- 監査の詳細は evidence/audit-summary.md と delegation/result-*.md。
