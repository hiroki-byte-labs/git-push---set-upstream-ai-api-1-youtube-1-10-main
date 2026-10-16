# 作業記録 T084
- 記録者・実施者: Codex
- モデル: gpt-6.1-sol (runtime。開始後にGatewayの当該sessionで確定し訂正)
- 開始日時: 2026-10-13T22:18:22.954Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T084のみ実装。台本に忠実なチェックリストのテキスト・画像・概要欄・動画末尾接続、安全検査、隔離デモと証跡、STATUSとSkill評価、finish/check。外部API・課金・投稿・認証不可。既存差分を保護。

## 実施内容・変更ファイル
担当変更: src/checklist.ts（新規）、src/plan.ts、src/lint.ts、src/metadata.ts、src/commands/sample.ts、src/commands/serve.ts、src/review.ts、scripts/render.swift。scene.practiceから原文・場面・出典・架空区別を保持し、JSON/txt/ページ分割PNG/概要欄/末尾actionへ接続した。画像は既存AppKitの文字計測を再利用。文字数と項目数、原文の一文、出典、actionの位置と案内、概要欄上限を検査。確認画面と承認版へ成果物を加え、変更・追加・欠落による失効と欠落時の承認拒否を実装した。
fixtures/checklist-demo.jsonとtests/checklist.test.tsを追加。docs/T084-CHECKLIST.md、READMEのリンク、tickets/T084.md、docs/STATUS.mdを更新した。既存の利用者差分は巻き戻していない。T084以外のチケットや保護設定を変更していない。

## 判断と理由
意味の推測で実践項目を増やすと架空の助言になるため、作者が指定したナレーションの一文だけを採用。語句の抜粋で否定や条件を切り落とさない。出典は場面の参照を継承し、架空の例を明示。出典が主張を裏付けるかの意味の照合は台本審査に残し、自動検証済みとは表示しない。未指定の旧台本は助言なしのプレースホルダーを出す。承認済み台本の場面を自動追加せずactionを作者が明示する。3項目/画像、80字/項目、12項目/台本で、超過は切り捨てず停止する。
Skill化評価: 隔離生成と終了記録は既存sample-render-verification/repository-task-closeoutに包含。今回の新規抽出処理は一度の実装で反復根拠なし。新規作成・既存更新とも見送り、既存Skillを今回へ適用。詳細はevidence/VERIFICATION.md。モデルは当該CODEX_THREAD_IDのGateway statusでgpt-6.1-solと確定したため自分のopen記録のみ訂正した。

## 検証コマンド・結果・証跡
開始check/nextは成功（112 tickets、103 sessions、agent readyなし）。依存T074/T041 doneを確認しstart T084成功。
最終対象試験 `./scripts/run --test tests/checklist.test.ts tests/metadata.test.ts tests/plan.test.ts` は36/36成功・終了0（evidence/target-tests-final.txt）。`./node_modules/.bin/tsc --noEmit` は終了0（evidence/typecheck-final.txt）。全体試験は269件中265成功/4失敗・終了1で、既存HTTP試験がlisten EPERM（evidence/all-tests-final.txt）。担当ファイルのdiff --check終了0。全体diffは他者の2ファイルの既存末尾空行を検出したので変更しなかった。
隔離 `sample --plan fixtures/checklist-demo.json` は終了0、32秒・768/768フレーム・fullDecode passed・PSNR最小39.985dB。通常2ページ、最大80字×12項目の4ページ、最終MP4の27秒actionフレーム、旧v1の項目なしPNGを実画像で目視した。6217バイト概要欄の隔離ジョブは終了1で音声/動画生成前に停止。旧v1 sampleも36秒・864/864フレーム生成成功。各コマンド・結果・証跡はevidence/VERIFICATION.mdを参照。mp4/wavは証跡に保存していない。
描画失敗の検査ファイル名を修正後、最終ソースでchecklist-demo-827dc748を再生成。先に目視したa1dccfa8版と画像2ページ・概要欄・チェックリストテキストのbytes一致、MP4のoutputHash一致をassertで確認（終了0）。多改行題名の収まり失敗も終了1・題名fitted=falseと正しいchecklist-report.jsonへの案内で検証した。

## 未実施・制約
実HTTP4試験とブラウザー実再生は環境制限で未完了。localhost listen EPERM、Safari操作はComputer Use was not approved to use Safariで拒否。確認音で、自然ナレーションではなくスピーカー試聴なし。RemotionでのMP4生成、人の工程を通すproduceの実生成は今回未実施（共通sample経路への接続）。外部API・課金・認証・投稿・push・commitなし。T084はreviewとしてdoneを保留した。
Token Monitorの当該実行exe_0mv78scre0a22ae61d377はrunning/missing、require-metered終了4（evidence/metering.txt）。実行完了後に親がGateway側で確認する必要がある。未計測を正常完了と扱わず、推測補完やDB変更をしていない。

## TODO・再開方法
この作業回はpausedで閉じる。再開者はT084とdocs/T084-CHECKLIST.mdを読み新しい作業回を開始し、localhost待受が可能な環境で全試験を再実行する。sample-render-verificationに従い隔離デモを再生成し、serveの確認画面で32秒を最後まで再生、字幕・末尾案内・出力画像と概要欄の対応を確認して証跡を残す。受入条件と実再生検証を満たしてからdoneにする。親は管理実行終了後にstatus exe_0mv78scre0a22ae61d377 --require-meteredを再実行し、未計測なら完了扱いしない。
現生成物は/private/tmp/t084-demo.vli4AQに隔離されているため消える可能性あり。再生成にはfixtures/checklist-demo.jsonを使用する。利用者の元outputsは変更していない。T116やT138〜T143への着手はこの作業回の範囲外。
