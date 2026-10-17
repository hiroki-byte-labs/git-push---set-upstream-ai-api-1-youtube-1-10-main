# 作業記録 T187
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-17T03:37:08.257Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
親セッションからの委譲: T187 optimizeSubtitleLinesをnative/Remotionの焼き込み字幕へ接続し、2行超過は文字配置検査で失敗、単体試験・verify・隔離実描画で確認。作業回を閉じたら全差分を1コミット（pushしない）。既存outputsは変更しない。

## 実施内容・変更ファイル
- `src/subtitle-optimizer.ts`: `subtitleDisplayText`・`SUBTITLE_LINE_CHARS(20)`・`SUBTITLE_MAX_LINE_CHARS(36)`・`SUBTITLE_MAX_LINES(2)` を追加。`optimizeSubtitleLines` を貪欲詰めから「最小行数→境界の質→行長のそろい」のDPへ変更。未使用のローカル関数4件を削除（motion-labのnoUnusedLocalsで失敗していたため）。
- `src/timeline.ts`: `RenderFrame.subtitle`（表示文字列）を焼き込み時に付与。
- `scripts/render.swift`: `RenderFrame.subtitle` を必須として字幕に使用（無ければ停止）。`lineFragments`（NSLayoutManager）で字幕の実際の行矩形・行の文字を `FitRecord.lines/lineTexts/expectedLines/maxLines` に記録。
- `motion-lab/src/remotion-plan.ts`: `RemotionCueProps.display` を追加。`PlanVideo.tsx` は `display` を渡す。`BurnInSubtitle.tsx` は `whiteSpace: 'pre'`、`overflowWrap: 'anywhere'` を削除。
- `src/layout.ts`: 字幕の行数と改行の不一致・行の文字の不一致を不合格に。`src/remotion-layout.ts`: cue測定の照合を `display` に、字幕記録に `expectedLines` と `SUBTITLE_MAX_LINES`。
- 試験: `tests/subtitle-display.test.ts`（新規6件）、`tests/remotion-layout.test.ts`（cue照合を display に）。
- Skill: `.agents/skills/sample-render-verification/SKILL.md` に、Remotionの隔離に必要なmotion-labのファイル、失敗系入力はfixtureを切り詰めない、全デコードは `-map 0:v -map 0:a` を追記。
- `tickets/T187.md`（done、結果）、`docs/STATUS.md`（再開地点）。

## 判断と理由
- 表示用改行は TypeScript で1回だけ計算し、両rendererへ同じ文字列で渡す（Swiftへ移植すると2実装の一致を保証できない）。renderer側は渡した改行以外で折り返さない: Remotionは `pre`、nativeは折り返しを残しつつ実際の行を記録して検査で不一致を落とす（`byClipping` は黙って切れるため使わない）。
- 1行幅: 目安15〜22字だが、Plan契約のcue上限55字は22字×2行に入らず、既存fixture（layout-stress、remotion-layout-stress）の55字cueが不合格になる。20字を優先し、2行に入らないcueだけ描画側の1行容量（36字）まで広げる。T187以前は描画側が約38字で折り返していたので、長いcueでも後退ではない。それでも入らなければ3行のまま渡し、文字配置検査で失敗させる（縮小・cue分割はしない。cue分割規則はT174の範囲）。
- 行の選び方: 貪欲版を実データに当てると「ふり返りや／すく」「保証するも／のでは」「重なら／ない」と語中で切れ、ブラウザー任せより悪化した。原因は tokenizer の助詞判定だが、tokenizer は cue分割（splitSmartCues）も使うため変えず、改行の選択側だけを改善した。
- VTTは改行を入れない（YouTube等のプレーヤーが自分で折り返す。本文の検索・字幕編集でも元の文が扱いやすい）。cueに元からある改行はVTT（T174追加修正）と同じ規則で保つ。
- motion-lab の型検査は HEAD でも `subtitle-optimizer.ts` の未使用変数で失敗していた（plan.tsの再エクスポート経由）。今回 remotion-plan から直接importしたため、動作に関係しない未使用宣言だけ削除。`tsconfig.tools.json` の既存エラー（orchestration-pipeline等、HEAD 26件→22件）は無関係のため触っていない。

## 検証コマンド・結果・証跡
- 単体: `node --test tests/subtitle-display.test.ts` → pass 6 / fail 0。全体: `./scripts/run --test tests/*.test.ts` → tests 437 / pass 437 / fail 0、`tsc --noEmit` 終了0（evidence/verify-tests-tsc.txt）。`./scripts/verify` は作業回open中は先頭の `cli.ts check` が「未終了作業: 033708-T187-c685b693」で終了1になるため、テストと型検査を個別実行した。finish後に `cli.ts check` と `./scripts/verify` を実行する。
- motion-lab: `tsc -p tsconfig.json` 作業ツリー終了0 / HEAD（git archive）終了2（未使用変数4件）。`tsconfig.tools.json` は既存エラー 22件（HEAD 26件）（evidence/motion-typecheck.txt）。
- 隔離実生成（scratchpad/iso、evidence/isolation-root.txt、isolated-renders.txt）: `NODE_BIN=/opt/homebrew/bin/node ./scripts/run src/cli.ts sample --plan fixtures/{sample-v2,layout-stress}.json --renderer {native,remotion} --subtitles both --resolution 720` の4本すべて「生成完了」、job completed、layout ok（native 708/556件、issuesなし）（evidence/*-job-media.json）。
- 行分割一致: native の全字幕記録（63/50件）で lineTexts＝渡した改行、render-spec の subtitle 集合＝remotion-props の display 集合＝native 測定文字列、Remotion の測定行数も一致 → ALL_MATCH True（evidence/line-split-native-vs-remotion.txt）。字幕サイズは30ptのまま（縮小なし）。
- 独立デコード: Remotion同梱 ffprobe `-count_frames` で 1152/1152/912/912 フレーム・48/48/38/38秒、h264+aac+mov_text。FFmpeg 7.1 `-map 0:v -map 0:a -f null -` で4本とも終了0（evidence/independent-decode.txt）。
- 目視: フレーム48/504/1128（sample-v2）と48/240/880（layout-stress）を native（上段）/Remotion（下段）で並べたPNG 2枚を確認。「判断の前に、自分の考え方を／確かめる練習をします。」「分けておくと、／後からふり返りやすくなります。」「学習用のデモです。／個別銘柄の…」「長い見出しと二行の字幕で、文字の位置が枠の中で／ずれないかを、720pと1080pの…」等、両経路で同じ位置の2行・中央・はみ出しなし（evidence/v2-native-top-remotion-bottom.png、stress-native-top-remotion-bottom.png）。
- 失敗系: sample-v2 の場面2 cue2 を2行に入らない55字（10字・30字・15字の文節）へ差し替えた台本で、native/Remotion とも終了1「文字配置検査に不合格（安全停止）… 行数上限を超える」、job failed、latest.json は更新されず（evidence/overflow-render-failure.txt）。最初は2場面へ切り詰めた台本でlint（最終場面の免責）が先に止めたため、全場面のまま1cueだけ差し替えて再実行した。
- VTT: 隔離生成の subtitles.vtt の12cueは台本のcue本文と完全一致（改行の追加なし）（evidence/vtt-unchanged.txt）。
- 元outputs: 実行前後で2253ファイルのパス・サイズ・mtime・SHA-256一致、latest.json は bias-check-demo-ee27087b のまま（evidence/outputs-preserved.txt）。

## 未実施・制約
- ブラウザー・AVPlayerでの実再生は行っていない（受け入れ条件は代表フレーム目視と独立デコード）。1080pの実生成も未実施（Remotionの座標はスケール共通で、単体試験は720/1080の両方を通る）。
- 改行品質の限界: tokenizer が語中のひらがなを助詞と判定するため、2行に詰める必要がある長いcueでは助詞の前で切れることがある（例: remotion-layout-stress の55字cue「…収まること／を検査します…」）。形態素解析の導入とtokenizerの変更はT187の対象外。
- 1行が36字を超える塊（区切りのない長い英数字など）は native の折り返しで行分割の不一致として不合格になる。描画側で縮小する仕組みは入れていない。
- 音声は自作の確認音で、聴取していない。

## TODO・再開方法
- チケットT187はdone。次は親セッションの指示に従う。改行品質をさらに上げるなら、tokenizer の語中ひらがな判定（「つなが／り」「で／す」）を cue分割への影響込みで直す別チケットが候補。
- 再現: scratchpad の隔離コピーは一時領域のため残らない。手順は `.agents/skills/sample-render-verification/SKILL.md`（今回追記）に従い、`fixtures/sample-v2.json`・`fixtures/layout-stress.json` を `--renderer native|remotion` で生成し、render-report.json の字幕 `lineTexts`/`expectedLines` を照合する。
- 定型作業の評価（routine-to-skill）: 隔離実生成の手順は既存の sample-render-verification と同一で、今回実際に詰まった3点（Remotion隔離に必要なmotion-labファイル、失敗系入力でfixtureを切り詰めるとlintが先に止まる、`-map 0` の全デコード失敗）を既存Skillへ追記して更新した。新規Skillは作らない（反復の根拠がこの作業回だけの手順はない）。
