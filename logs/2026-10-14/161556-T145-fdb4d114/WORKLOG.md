# 作業記録 T145
- 記録者・実施者: Codex
- モデル: gpt-6-astra (runtime)
- 開始日時: 2026-10-14T16:15:56.976Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
本人レビュー差戻し対応。提供済みreference1.mp4/reference2.mp4をローカル観察し、人らしい輪郭の自作ピクトグラムと滑らかな登場・移動をnative/Remotionへ実装、隔離試作で比較検証する。参考画素・音声は生成動画へ転用しない。外部API課金・公開なし。

## 実施内容・変更ファイル
T145を本人差戻しとしてin_progressへ戻し、人型と動きの不足を修正した。`src/illustration.ts`に独自人物輪郭と時刻ベースの状態計算を新設。首・肩・腕・腰・左右の脚・足先が分かる輪郭、0.7秒の登場と小さな浮き上がり、時間差での人数追加、0.85秒の線の伸長と柔らかい光を定義。`src/timeline.ts`はillustrationの変化フレームを24fpsで生成し同一静止区間だけ統合。`scripts/render.swift`と`motion-lab/src/primitives/SuperstarIllustration.tsx`は共通状態と共通輪郭を描く。`PlanVideo.tsx`と`remotion-plan.ts`からreveal時刻・fps・transitionsを渡す。`tests/illustration.test.ts`に回帰検証4件を追加。制作ガイド、資産台帳、観察/改修文書、T106後続作業表、ticket、STATUSを更新した。

隔離生成先は `/private/tmp/T145-smooth-6z3lvi_c`。受け渡しコピーはGit除外を確認した `work/T145-smooth-review-2026-10-15/`。両30秒MP4と12秒の左右比較（左:前回、右:修正版）を保存。動画本体はログ/Gitへ追加していない。

## 判断と理由
2026-10-15再開: 同じCodex作業回を引き継いだ。開始時の記録モデルはgpt-6-astra（runtime）、再開後の現モデルはgpt-6-sol（runtime）。別の実施者の未終了作業回を代理終了する操作ではない。再開後は欠けていたSkill確認証跡と終了検査を補う。

T111に参考素材の場所と利用者指定の解析根拠があり、今回も本人が参照実装を明示しているため再確認を求めずローカル観察した。参考1の78〜88秒、参考2の36〜46秒を0.25秒間隔で復号し、人型の構造と順次登場を観察。新たな0.7/0.85秒や補間曲線は設計値で、参考の正確な実測値とは報告しない。

初回T145には、Remotionが場面開始時刻で進捗を計算して遅い登場時には完了済み、nativeがillustrationを連続描画しない、という問題があった。完成フレームと再生完了だけでは見逃したことを今回の文書に明記。両経路で時計と輪郭を共用し再発の差異を減らした。人物の形だけを変えるより修正範囲が広いが、本人の「動きや登場をなめらかに」に必要な変更。

定型作業評価: 初回154925-T145と今回161556-T145のレンダー/目視の反復から、完成状態だけで動きを判断する欠点を抽出。routine-to-skillとskill-creatorを参照し、既存sample-render-verificationへ「遅い登場の前後の密なフレーム検査、既出要素が巻き戻らない確認」を限定追加。今回の両MP4の2〜3秒復号とブラウザー通常速度再生で試用。新規Skillや権限拡張は不要。

## 検証コマンド・結果・証跡
開始時 `./scripts/run src/cli.ts check` は114 tickets / 118 sessionsで成功、`next`はT133 human ready、T134/T145 reviewを表示。対象ログを正規startで開始した。

- `./scripts/run --test tests/illustration.test.ts`: 修正前にnativeの連続12フレーム期待が3区間で失敗（exit1、evidence/before-fix.txt）。修正後はillustration/timeline/presentationの22件成功（after-fix.txt）。
- `./scripts/run --test tests/*.test.ts`: 316/316成功、exit0（all-tests.txt）。`./scripts/run --test motion-lab/tests/*.test.ts`: 17/17成功、exit0（motion-tests.txt）。
- root `tsc --noEmit` と `tsc -p motion-lab/tsconfig.json` 成功（root-typecheck.txt、motion-typecheck.txt）。変更した3つのRemotion TS/TSXファイルのESLint成功（changed-files-eslint.txt）。全体ESLintは既存VoidBackgroundの未使用glowColor error 1、既存SilhouetteGroupのCSS transition warning 1でexit1（eslint.txt）。これらは今回未変更。最初のESLint呼出しはcwdと相対証跡パスの不一致で失敗し、rootから正しいパスで実行し直した。
- fixture lint error0/warning0、exit0（fixture-lint.txt）。台本本文と秒数は比較のため変更していない。
- 隔離コピーで `sample --plan fixtures/sample-superstar-illustration.json --renderer native|remotion --resolution 720` を実施。nativeは357画像を描画。両MP4は30秒・1280x720・24fps・720フレーム。native media PSNR最小41.3dB。各render/job/media-checkはevidenceへ保存。Remotion組込みレポートの固定値だけを根拠にせず、FFmpegで両方の映像/音声を独立全デコードし720フレーム・exit0を確認（native-decode.txt、remotion-decode.txt）。
- 組込みブラウザーでserveの各jobページを開き、無音・playbackRate1で先頭から全編再生。native currentTime 0.33948→30、Remotion 0.150667→30、両方ended=true、readyState4、1280x720（browser-playback.jsonは実際のCUA結果の転記）。検証タブを閉じ、serveをCtrl-Cで停止（終了130、意図的停止）。
- 両MP4の5/10/16.75/25秒の復号画像を目視（native/remotion-frames.png）。nativeは2〜3秒を8fpsタイルで目視（native-entrance.png）。人物領域を24fpsで数値確認しnative23/Remotion24の異なるフレームを検出、登場に伴う輝度増加を確認（decoded-motion.json）。比較MP4も全288フレーム独立デコード成功（comparison-decode.txt）。
- 参考動画のSHA-256を記録（reference-input-hashes.json）、既存outputs全ファイルのsize/mtimeが生成前後で同じことを確認（outputs-before.json、outputs-unchanged.json）。
- Skillのquick_validateは環境にPyYAMLがなくexit1（skill-validator.txt）。front matter、参照、未記入、許可範囲は手動/標準ライブラリ検査で確認し、実動画で追記手順を試用（skill-review.txt）。形式検査の失敗を成功扱いしていない。
- 新規委譲なし。対話Hookのtask `tsk_0mv8b9o3n87fee6047a19` を `agentctl status --require-metered` で確認したところmanaged=false / running / metering_status=missing、exit4（current-task-metering.txt）。この対話の使用量計測完了とは報告しない。過去の委譲実行やDBは変更していない。

## 未実施・制約
本人の見た目/動きの好みの承認は未実施。参考動画の全場面や正確なイージング係数・音声同期を再現したとは扱わない。音は自作確認音のみ、スピーカー実聴・自然なナレーション・実TTS/API・外部公開なし。ブラウザーのgetVideoPlaybackQualityは読取りブリッジに未提供で呼出し失敗し、dropped frames等は未取得。全体ESLintの既存別部品の2指摘、Skill validatorのPyYAML不足、対話Hook計測missingは上記の制約として残る。

## TODO・再開方法
T145は修正版の本人レビュー待ち（review）。`work/T145-smooth-review-2026-10-15/remotion.mp4` を主な確認用、`before-after.mp4`を左旧版/右新版の比較用として渡す。native版も同フォルダ。輪郭と登場速度の回答を次のT145作業回で記録し、必要な修正を行う。今回の検証証跡と参照区間は `docs/T145-REFERENCE-REVIEW-2026-10-15.md` と本作業回evidenceにある。未承認の旧動画は置換せず履歴として保持。作業ログのcompletedは今回の実装・検証記録を閉じる意味で、本人承認や使用量計測完了を意味しない。
