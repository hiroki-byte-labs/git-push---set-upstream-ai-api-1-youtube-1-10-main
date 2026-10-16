# T084の検証（2026-10-14 JST、Codex）

開始時のcheckはOK（112 tickets、103 sessions）、nextはagent readyなし。T084はbacklogだが依存T074はdoneで、利用者の明示指示により着手。core.hooksPath=.githooks、既存pre-commitを確認し、初回cloneの設定を上書きしなかった。

## 試験と静的検査

- `./scripts/run --test tests/checklist.test.ts tests/metadata.test.ts tests/plan.test.ts`: 最終36/36成功、終了0、target-tests-final.txt。原文の一文・場面・出典、架空表示、未指定旧台本、80字と12項目の境界、不正参照、actionの末尾配置・免責、概要欄上限、承認失効・欠落時の承認拒否、限定GETハンドラーを確認。
- `./node_modules/.bin/tsc --noEmit`: 終了0、typecheck-final.txt（出力なし）。
- `./scripts/run --test tests/*.test.ts`: 269件、265成功/4失敗、終了1、all-tests-final.txt。失敗はapproval/production/reviewの既存HTTP試験のlocalhost listen EPERMのみ。実HTTPを模擬ハンドラーの成功で置き換えて報告しない。
- `git diff --check`: 終了2、既存差分docs/DECISIONS.md:83とtests/production.test.ts:217の末尾空行を指摘。他者の差分なので変更せず。今回の担当ファイルを指定したdiff-checkは終了0（diff-check.txt）。

## 隔離生成

sample-render-verification Skillに従い/private/tmp/t084-demo.vli4AQへsrc/scripts/fixtures/config/prompts/package.json/motion-labをコピー。work/python-depsのみ元リポジトリへsymlinkし、Swift描画器とキャッシュはコピー先で作成。NODE_BIN=/opt/homebrew/bin/nodeを明示。元outputsは変更していない。

`./scripts/run src/cli.ts sample --plan fixtures/checklist-demo.json`: 終了0、demo-generation.txt。最終ジョブchecklist-demo-827dc748。描画失敗の案内先修正後、同じ最終ソースで再生成し証跡を差替えた。32秒、1280×720、焼き込み字幕、自作確認音（自然ナレーションではない）。768/768フレーム、音声32秒、fullDecode=passed、PSNR最小39.985093dB、lint error0/warning2、metadata/layout/readability/thumbnail/checklistの検査成功。media-check.jsonとjob.jsonに実値を保存。

checklist.json/txt、画像checklist-1.png/2.png、実計測checklist-report.json、metadata.jsonとsubtitles.vttをコピー。チェックリスト4項目すべてと原文・場面・出典番号が概要欄に一致することを単体試験で確認。1ページ目の3項目は架空の例/出典なし、2ページ目は場面2/出典[1]。画像の目視で全文と対応表示に欠落・はみ出し・重なりなし。

FFmpegで最終MP4の27秒をデコードしてaction-frame.pngに保存し目視。末尾の「判断前に確認する」、チェックリストの札、概要欄→出典と場面→台本の読み返しの図解、結果を保証しない免責字幕が表示された。動画をブラウザーで再生した証拠ではない。

最大80字（「確認」40回）×12項目の台本を隔離stressディレクトリへ作り、同じ`work/render <dir> --checklist`を実行。終了0、stress-generation.txt、stress-report.json、stress-1.png〜4.png。実践項目の記録は12件、全枠fitted=true、最小20pt、コントラスト最小6.31553。全4ページを目視し、3項目の折返しと出典欄・注意欄の分離を確認。

最終描画器に60字の多改行題名（「題\n」30回）を入力する隔離試験も実施。`work/render <unfittable-dir> --checklist`は終了1、checklist-report.jsonの題名fitted=false、エラーに正しい検査ファイル名を出して停止（unfittable-generation.txt/unfittable-report.json）。収まらない文字を合格扱いしない。

最大項目の台本に300字導入文と120字文献名を追加すると概要欄6217バイト。隔離sampleは終了1で「5000バイトを超えています」と停止（overflow-generation.txt）。実際の停止はchecklist描画後・音声/動画生成前。項目の切り捨てなし。

旧v1の`./scripts/run src/cli.ts sample`: 終了0、legacy-generation.txt。reflection-demo-52bc6d4e、36秒、864/864フレーム、全デコードpassed（legacy-media-check.json）。未指定チェックリストのPNG（legacy-empty.png）を目視し、項目未指定と自動補完なしの表示を確認。

## 実再生と計測の未完了

HTTPの待受はlisten EPERMで拒否される。cua.getStateのブラウザー一覧は空。代替のSafariローカル再生をcua.getApp('com.apple.Safari')で試したが、`Computer Use was not approved to use Safari`で拒否された。ブラウザー再生、endedまでの進行、スピーカー試聴は未実施。制限の迂回はしていない。

Token Monitorを読み、`scripts/agentctl status --session "$CODEX_THREAD_ID"`で自分の管理実行exe_0mv78scre0a22ae61d377を照合（model_id=gpt-6.1-sol）。開始時モデルをgpt-6と記載していたため、確定した実行情報に合わせ自分のopenのsession.jsonとWORKLOGのモデルを訂正した。過去の終了記録や計測DBは変更していない。

`scripts/agentctl status exe_0mv78scre0a22ae61d377 --require-metered`: running/missing、終了4（metering.txt）。実行中なので値を推測して補わず、親Gatewayで応答終了後に再検査する必要がある。子のAI実行は今回起動していない。タスクはreview、作業記録はpausedで終了する。

## Skill化評価

候補: 隔離生成→自動検査→実デコード画像の目視→終了記録。T104等の既存反復はsample-render-verificationとrepository-task-closeoutが既に扱い、今回もその原本を読んで適用した。追加する有効な分岐は確認できず、既存Skill更新は見送り。T084の項目抽出・画像生成自体は単発実装で反復根拠がなく、新規Skill化しない。使い方はdocs/T084-CHECKLIST.mdに残す。再帰評価なし。
