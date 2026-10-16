# 作業記録 T154
- 記録者・実施者: Codex
- モデル: gpt-6 (runtime)
- 開始日時: 2026-10-15T16:03:23.555Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T154を実装。字幕3モード、累積cue境界、reveal/transitions、対象試験と型検査、隔離Remotion生成を検証。外部AI・有料API・push・投稿は禁止。

## 実施内容・変更ファイル
README/SPEC/STATUS/AGENT-WORKFLOWとT154、依存T044/T079/T106/T126/T153を読み、check/nextを実行。checkはOK 126 tickets、128 sessions。nextのagent readyはなしだが、利用者指定の依存完了T154を正規start後にin_progressへ変更した。既存Gitフックはcore.hooksPath=.githooks、pre-commitに正規検査が存在する既存cloneで、再インストールは不要。

実装変更: src/remotion-visual.ts、motion-lab/src/remotion-plan.ts、PlanVideo.tsx、StandardDiagram.tsx、primitives/BurnInSubtitle.tsx。新規diagram-timing.tsで通常図解の各段のreveal/独立時計を共通化。字幕モードを描画まで引き渡し、累積cue境界を共有、短いcueのフェードを縮小。出典札/架空札と既存の枠なし字幕方針を保持した。

試験/fixture: motion-lab/tests/subtitle-timing.test.ts、standard-diagram.test.ts、fixtures/sample-subtitle-timing.json。既存meter試験は固定10frame登場からPlanの0秒登場へ変わったため、登場前=-1frame/進行中=5frameで符号と棒幅を検査するよう更新。

記録: tickets/T154.md、docs/STATUS.mdと本WORKLOG/evidence。他者が作成済みの多数の未追跡/変更ファイルを保持し、T154の必要箇所以外は編集しなかった。

## 判断と理由
利用者が指定したremotion-best-practicesルーターのmarkup/timing・captions/display-captions・render参照、sample-render-verification、repository-task-closeout、routine-to-skillを適用。既存Planのcue型と合意済み字幕デザインが明示仕様なので、汎用BasicCaptionsへの置換や新規依存追加は行わず、既存BurnInSubtitleを修正した。

cueの個別丸めの合計は端数秒でずれるため、累積秒の開始/終了をそれぞれ丸め、最後のcueを場面終端と共有する。全区間はstart以上/end未満とし、onフレームから可視にして境界の空白を避けた。フェードを片側最大0.1秒/長さの1/6に抑え、最短cueに2/3以上の完全表示を残す。図解の段数・既定revealは既存shared/illustration.tsを再利用し、動きは次段までの時間と0.5秒で制限する。各段を独立計算して後続登場の巻き戻しを避ける。

Chrome起動失敗は描画成功に読み替えない。受け入れ条件の実媒体確認を満たしていないのでT154はin_progress、この作業回はpausedで閉じる。

Skill評価（記録者Codex）: T139/T152/T153と今回の隔離生成→実デコード→環境制約時の未確認分離は既存sample-render-verificationとrepository-task-closeoutに含まれる。今回は両Skillを実際に適用し、初回のtsconfigコピー漏れは補完再試行した。今回特有のcue/reveal境界は再利用fixtureと回帰試験で固定済みで、別Skillは重複となるため見送り。Skill原本の変更はなし。

## 検証コマンド・結果・証跡
修正前: ./scripts/run --test motion-lab/tests/subtitle-timing.test.ts → 6 tests/0 pass/6 fail、終了1（evidence/before-fix.txt）。モード欠落、累積丸め、reveal非対応を再現した。

修正後: ./scripts/run --test motion-lab/tests/*.test.ts tests/remotion-media.test.ts tests/presentation.test.ts → 54 tests/54 pass/0 fail、終了0（evidence/after-fix.txt）。24/30fps、3モード、端数秒、before/on/after、複数場面のローカルframe、最短0.5秒cueの8/12・11/15frame完全表示、演出無効時の字幕即時表示、通常5図解の登場/完成状態/既出段維持を含む。静的React描画の時刻/解像度Hookは試験値へ置換しており実動画の証明ではない。

./node_modules/.bin/tsc --noEmit、./motion-lab/node_modules/.bin/tsc -p motion-lab/tsconfig.json、同tsconfig.tools.json → すべて終了0（evidence/typecheck-root.txt、typecheck-motion.txt、typecheck-tools.txt）。最終ソース修正後にroot/motionを再実行、toolsは対象ソース変更前後で変化なし。

./scripts/run --input-type=module のNode比較処理でfixtureをloadPlanし、buildVttとtoRemotionPlanPropsを24/30fps×burn/soft/both×transitions true/falseの12組でassert比較 → 終了0（evidence/props-vtt-comparison.json）。全30cue連続、最大誤差24fps=0.020秒/30fps=0.013334秒、1frame以内。

隔離先 /private/tmp/T154-verify-gWatoCHf にsrc/scripts/fixtures/config/prompts/package.jsonとmotion-lab/src/shared/package/remotion.config/tsconfigを複製。motion-lab/node_modulesとwork/python-depsは既存依存へのsymlink、Swiftキャッシュは新規。NODE_BINをcommand -v nodeの実行ファイルへ明示し、隔離scripts/run src/cli.ts sample --plan fixtures/sample-subtitle-timing.json --renderer remotion --subtitles burn（soft/bothも同様）を実行。burn初回はtsconfigコピー漏れで終了1（render-burn.txt）。補完後burn再試行もChrome起動失敗・終了1（render-burn-retry.txt）、soft/bothもChrome SIGABRTで終了1（render-soft.txt、render-both.txt）。全job.failed、MP4なし。render-summary.json、各モードのjob/props/VTT/lintをevidenceへ保存。実Propsは3モードとも指定どおり、lint errors=0。

scripts/agentctl status T154 --require-metered → 終了2「実行がない: T154」（evidence/agentctl-metering.txt）。今回は外部AI/agentctl run/子エージェントを起動していない。管理対象の実行はなく、対話使用量は不明でありmeasuredとは報告しない。

git diff --check → 終了2、既存のdocs/DECISIONS.md末尾空行、docs/STATUS.md T151行末空白、tests/production.test.ts末尾空行を検出。いずれも開始前から存在する他者変更で、範囲外の整形は行わない。最後に正規finish --status paused、その後cli checkを実行する（終了後の結果は利用者への最終報告、閉じたログへ追記しない）。

## 未実施・制約
Remotion生成がChrome起動で失敗しMP4がないため、独立ffprobe/全映像音声デコード、実フレームのbefore/on/after目視、VTTと焼き込み比較、実字幕トラック、ブラウザー字幕切替/再生、AVPlayer実再生は未実施。30fpsの実レンダリングも未実施。今回の確認音はナレーションではなく実聴していない。生成失敗を成功扱いせず、制約の迂回は行わなかった。

全体試験は未実施。必要なmotion-lab全試験と本体の関連試験54件/型検査に限定。既存outputsを増やさず、動画/音声本体はログへ保存しない。外部API、契約、課金、別AI直接起動、push、投稿は実行なし。

## TODO・再開方法
T154のみ実媒体確認を再開する。Chromeが起動できる実行環境で最新ソースを再度隔離コピーし、fixtureのburn/soft/bothを各生成。24/30fpsのcue境界と最短cue、delayed revealの前後を細かく独立デコードして目視し、transitions=falseで指定時刻に完成状態になることも確認する。30fpsはCLIの24fps既定を変更せず、隔離先でRemotionVisual(mode,720,30)を使う。soft/bothのmov_textとVTT対応・ブラウザー字幕切替、全デコード/実再生を確認し、すべての受け入れ条件を満たした時だけticket doneへ変更して新作業回を閉じる。既存の隔離先は調査用に残すが最新ソースへの再コピーが必要。T155以降は依頼範囲外で未着手。
