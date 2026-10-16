# T142 実装・文書・依存の照合（2026-10-14 JST）

Codex / GPT-6（runtime）。実行環境の自己情報で確認できる名称はGPT-6のみ。詳細モデルID・使用量は取得不可で、推測で補わない。今回の対象チケットはT142だけ。他チケットの状態・depends・本文は一切変更しない。README/SPEC/STATUSの明確な一般説明は直接訂正し、残りは以下の具体案として残す。

## 行単位の矛盾と正本の扱い

変更前の行番号は同ディレクトリのbefore-README.md、before-SPEC.md、before-STATUS.md（元ファイルと同じ行番号）による。コード・チケット参照は今回の作業ツリー。既存変更を含む状態を調査しており、Git HEADと混同しない。source-lines.txtに根拠の行番号付き抜粋を保存する。

| 正本・矛盾箇所 | コード/テスト等の根拠 | 判定・具体差分 |
| --- | --- | --- |
| 変更前README.md:5「日本の投資初心者」「台本は固定」 | src/providers.ts:11（任意Plan読み込み）、README.md:2、tests/documentary-pipeline-e2e.test.ts:97（考察入り下書き） | 一般知識・Plan v2・本人工程対応へ訂正済み。固定台本はM1試作の説明に限定。 |
| 変更前README.md:8、変更前docs/SPEC.md:11「実行時npm依存なし」 | src/commands/sample.ts:103（Remotion選択）、src/remotion-visual.ts:49（CLI実行）、motion-lab/package.json:1（依存定義） | nativeだけの説明に限定し、任意Remotionの依存/Chromeを追記済み。Remotionの別OS対応は今回未検証で保証しない。 |
| 変更前docs/SPEC.md:16「候補はGemini API」 | tickets/T025.md:24、tickets/T026.md:23（台本生成は不採用）、orchestration/gemini-video.ts:21（mock限定transport）、orchestration/gemini-video.ts:83 | 台本Gemini不採用と動画理解T116を区別して訂正済み。T027のGemini系音声候補まで不採用に読み替えない。 |
| 変更前docs/SPEC.md:55「Remotion等はmotion-lab内だけ」「制作ジョブと接続しない」 | src/remotion-visual.ts:23、src/remotion-visual.ts:40、src/commands/sample.ts:142、src/commands/produce.ts:20 | 描画は本体統合済みへ訂正済み。参考動画解析は独立。ADR-020はT110時点の履歴として保全し、現行SPECから追記を適用。 |
| 変更前docs/SPEC.md:28の完成動画検査の一般説明、tickets/T126.md:28の媒体/全デコード/配置検査合格 | src/remotion-visual.ts:136のverifyMediaは字幕ストリーム確認のみ。src/remotion-visual.ts:150のvideoFramesは期待値、src/remotion-visual.ts:151のfullDecodeは固定passed。src/remotion-visual.ts:114からの配置レポートも固定box/size等を使用 | 現行SPEC/README/STATUSはnative検査とRemotionの限界を区別して訂正。他チケットへの差分案: T126の短尺生成記録と独立媒体検査を分け、固定passedを全デコード実測と扱わず、実検査の追試を残件にする。コードの検査改善は対象外。T126のrendererKind記述はremotionだが実コード/JSONはlocal.remotionであり、別作業で訂正する。 |
| tickets/T021.md:27「Gemini/音声/Runwayの完了を束ねる」 | tickets/T025.md:24（契約未実施の不採用終了）、tickets/T029.md:29（保留可） | 他チケット変更禁止のため未適用。差分案: 「必要な採用サービスだけの設定を束ね、不採用終了を設定成功と扱わない」。依存案は次節。 |
| tickets/T022.md:27「T026（Gemini）…T060（Runway）」「未実装」 | tickets/T026.md:23、src/commands/sample.ts:114、src/remotion-visual.ts:23 | 未適用。差分案: 「共通接続/予算は実装済み、台本API不採用、音声実接続はT028待ち、Runwayは任意分岐」。親の完了条件は方針決定が必要。 |
| tickets/T127.md:27「安全に結合」、tickets/T127.md:37「受け入れ条件を満たし完了」 | src/audio-pipeline.ts:66（全関数はスライス呼出とパス/秒数集計）、src/audio-pipeline.ts:102（結合ファイル返却なし）、src/audio-pipeline.ts:163（減衰区間計算）、src/audio-pipeline.ts:198（数値判定）、tests/audio-pipeline.test.ts:64 | 実WAV結合・ミックス・実測・自然TTSの合格とは言えない。README/SPEC/STATUSで境界を訂正済み。他チケットへの差分案: 結果を「接続抽象/メタデータのmock試験完了。実WAV処理はT138、実TTSはT027/T028、人の試聴は未完了」と置換。doneの範囲/受入条件再評価は別作業。 |
| tickets/T129.md:19「媒体検査」、tickets/T129.md:26「一連のパイプライン完走」、tickets/T129.md:35「全件充足」 | tests/documentary-pipeline-e2e.test.ts:52（文字列fake-mp4）、tests/documentary-pipeline-e2e.test.ts:118（存在しないmock音声パス）、tests/documentary-pipeline-e2e.test.ts:146（固定音量入力） | README/SPEC/STATUSでmock E2Eと明記済み。他チケットへの差分案: 「5シナリオは工程/承認のmock E2E。媒体品質・費用不明・再試行/再実行の全受入れはこの5件だけでは保証しない」。このファイルに費用不明注入・レンダラー失敗・実デコードの試験はない。状態/受入条件の修正は別作業。 |
| tickets/T040.md:27「Remotion…未着手」「複数ジョブ/同時数制限…未着手」 | tickets/T126.md:25、src/remotion-visual.ts:23、src/local-queue.ts:1 | 未適用。差分案: Remotion描画統合はT126完了、キュー部品はT141で実装済みだが通常制作統合は未完了、辞書/部分生成等の残件は個別再確認、と訂正。全体doneにしない。 |
| 変更前docs/STATUS.mdの「機能の現状」で無人運用を一括未実装、T070/T007/T015を現在の上位人作業とする説明 | tickets/T140.md:6、tickets/T141.md:6、tickets/T070.md:6、tickets/T007.md:6、tickets/T015.md:6 | 独立mock投稿/永続キュー部品と通常制作未統合を区別して訂正済み。完了済み人作業は履歴と明記。過去の時点記録は変更しない。 |

## Runway必須化の影響と依存グラフ案（未適用）

矢印は「依存先 → その完了を必要とするチケット」。根拠は各ticketsの8行目。

```text
現在:
T020 → T025(done:不採用) → T026(done:不採用) → T022
T020 → T027(backlog) → T028(backlog) → T022
T024 → T028
T020 → T029(backlog:保留可) → T060(backlog) → T022
T024 → T060
T020,T025,T027,T029 → T021 → T022
T020 → T022
T022 → T032（別途T031） → T050
T022 → T040 → T050
```

T029を保留するとT021とT060が完了せず、T022、T032、T040、T050へ待ちが伝播する。T021/T022はbacklogなので依存を除くだけでnextに出るわけではない。ready化と完了条件の整理も別判断。T060のT029依存そのものは実映像接続に契約/承認を要求する妥当な安全条件で、削除しない。

Runway保留でも現行グラフのまま可能な経路:

- 台本: T122/T123のエージェント下書き → produce new/select/reflection/script/script-review → 承認済みPlan。T025/T026のAPI実装を必要としない。本人の選択・考察・承認は省略しない。
- ローカル音声/図解: CueAudio（src/providers.ts:13）の確認音 + nativeまたはRemotion → MP4。自然TTSではない。
- 模擬媒体音声: T127 → T138の合成WAV結合/ミックス/デコード。T139は隔離接続の試行まで、実MP4生成は未達。
- 実音声: T020 → T027（本人採用・契約・予算）+ T024 → T028 → T077（読み方辞書）。T028の既存dependsにT029/T060/T021はないため、Runway保留でも本人承認後に着手可能。ただし今回は実行禁止。

提案A（採用サービス親を維持する最小案。利用者方針決定後の別作業）:

```text
T021 depends: T020,T027                # 現在からT025/T029を外す
T022 depends: T020,T021,T024,T028      # T026/T060を外し共通基盤T024を明示
T060 depends: T024,T029               # 変更なし、任意映像分岐として維持
T032 depends: T022,T031               # 変更なし
T040 depends: T022                    # この案では維持
T050 depends: T032,T040               # 変更なし
```

提案B（APIを伴わない制作と実接続を分離）: 新規のローカル制作統合親を別途起票し、T126/T127/T128/T129/T138とT139の未達媒体検証を束ねる。既存T021/T022は外部実接続の親として維持する。T040のローカル工程はその親へ分離し、実音声工程はT028へ依存させる。新規番号は予約しない。人の必須工程・未達の実長尺MP4/人の試聴/実API受入れをdone扱いする近道にはしない。

決定が必要な正本: T021/T022の採用範囲・受入条件・depends、T040の親/子分割、T127/T129のdoneが表す範囲、任意Runway再開時の親との関係。今回は既存dependsを一切変更しない。台本不採用でT116まで停止する依存は提案しない。

## mock・実媒体・実APIの確認範囲

| 対象 | 実ファイルの有無/測定 | 確認できる範囲と限界 |
| --- | --- | --- |
| T129 | fakeRenderの文字列をsample.mp4として保存。mock/path/audio.wavは生成しない | 5件の工程・承認・予算拒否テスト。実動画の全デコード/レイアウト/字幕表示/音量実測/声質/実API試験ではない。 |
| T127 | 接続が返すパス/秒数のみ。WAV結合コードなし | 7件の分割・予算・同期値・ダッキング計算・音量閾値・評価リンク試験。実媒体/実試聴ではない。 |
| T138 | src/mock-audio-media.ts:100のconcatリスト、src/mock-audio-media.ts:101のFFmpeg結合、src/mock-audio-media.ts:125のPCM検査 | 実WAV結合あり。今回tests/mock-audio-media.test.ts:18等4件を実行し、短い合成トーン音声のデコード・減衰・故障保護を確認。自然TTSなし、通常sampleには未接続。 |
| T139 | 過去long-mock-audio-check.jsonは604秒/41cue/24kHz monoを実デコード。long-job.jsonはfailed | 過去の604秒実WAV結合はあり。long-render.txtはChrome SIGABRT、MP4なし。今回は過去JSON/ログを照合しただけで再生成・再生していない。 |
| T126 | 過去remotion-sample-job.jsonはprobeで48秒/1152フレーム/H.264/AAC、mediaにfullDecode=passed、narration=false | 本体統合と短尺実MP4の過去生成記録あり。ただしmediaのpassed/フレーム数は現コードでは固定値/期待値。probeの生成コマンドもこのJSONだけでは追跡できず、全デコード合格とは判定しない。今回は生成・再生・独立測定の追試なし。実長尺MP4完走へ一般化しない。 |
| T116 | mock transportを必須DI。orchestration/gemini-video.ts:90でmock以外を拒否 | リクエスト構築・応答契約・unavailable処理。動画理解と台本生成を区別。実動画解析・実サービス互換性は未検証。 |
| T028/T060/投稿 | 今回実接続なし、通常Publisherはsrc/providers.ts:18でdisabled | 実API・認証・課金・YouTube投稿を一切実施していない。T140のmock Publisherは実投稿ではない。 |

参照した過去証跡（今回の実測と区別）:

- logs/2026-10-12/231006-T126-15eb5886/evidence/remotion-sample-job.json
- logs/2026-10-13/223523-T138-323bf830/evidence/media-check.json
- logs/2026-10-13/224405-T139-ca44700d/evidence/long-mock-audio-check.json
- logs/2026-10-13/224405-T139-ca44700d/evidence/long-job.json
- logs/2026-10-13/224405-T139-ca44700d/evidence/long-render.txt

今回の実行: 対象16件pass/fail=16/0・終了0（tests.txt）、ルート型検査終了0（typecheck.txt）。参照存在/行番号/依存案の循環・漏れ/重複/他チケット不変の検査はaudit-check.txt。正本文書の具体変更はdocs-diff.patch（開始時点からの差分）。実MP4生成・視聴・実API・全体試験は今回未実施。Token Monitorはstatus T142 --require-meteredで登録実行なし・終了2（metering.txt）、計測完了とは扱わない。

## 定型作業のSkill評価

候補は「文書の一般説明をコード・mock/実媒体証跡に照合する作業」。今回T142が具体的な独立実績で、T099等は終了整理の履歴だが同じ媒体/依存監査の反復を確認できていない。既存repository-task-closeoutの証跡保存・終了順序を実際に適用。入力は対象チケット/正本文書/コード、出力は矛盾表と未適用差分。既存Skillと終了作業が重複するため新規/更新は見送り。依存案適用の権限をSkillで広げない。評価はこの作業回で一度だけ。
