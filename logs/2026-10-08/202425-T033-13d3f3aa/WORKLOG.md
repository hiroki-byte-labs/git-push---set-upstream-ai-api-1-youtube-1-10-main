# 作業記録 T033
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
エンハンス一括実施のうちT033（ローカル承認プレビューとジョブ管理、候補4・10・11）。投稿はしない。ローカル作業のみ

## 実施内容・変更ファイル
- src/review.ts（新規）
  - review.jsonの履歴は{decision, note, outputHash, inputHash, at, reviewer}。
  - approvalOfの状態: pending、approved、rejected、expired（承認時のハッシュと現在のsample.mp4、またはjob.outputHashが異なる）、not-reviewable（未完了）。
  - recordReview: 表示中の版（expectedHash）が現在のファイルと一致するときだけ記録する。差戻しは理由のメモが必須で、メモは500字まで。
- src/jobs.ts（新規）
  - JOB_ID、listJobs、isStale（pidの死活、またはpid記録なしで1時間超）、abandon（動作中なら拒否）、planClean/applyClean（failed/abandoned → _trash、直下の散らかったファイル → _archive/<日付>、移動のみ）。
- src/commands/serve.ts（全面改訂）
  - createHandler(root)はテストからも使う。
  - 画面とファイル: GET /（一覧）、/job/<id>（詳細）、/job/<id>/sample.mp4、/job/<id>/subtitles.vtt（<track>で読む）。
  - POST /job/<id>/review（承認・差戻し）。trustedPostでHostが127.0.0.1:4173またはlocalhost:4173かを確かめ、Originがあれば同じ値かを確かめる。違反は403、版の不一致は409、成功は303。
  - 旧URL /sample.mp4（最新ジョブ）は互換のため残した。
  - HTMLはすべてエスケープする。Rangeはsuffix（bytes=-N）に対応し、416にContent-Rangeを付ける。
- src/cli.ts: jobs、jobs abandon <id> [--note]、jobs clean [--apply]、review <id> [approve|reject --hash … --note … --reviewer …]を追加し、使い方を複数行にした。
- src/commands/sample.ts: job.jsonにpidを記録する。
- tests/review.test.ts（新規、7件）: 承認と失効、版の不一致・未完了・理由なしの拒否、中断の検出とabandon、clean、Host/Origin、HTTPの総合試験（エスケープ、Range、suffix、404、Origin違反の403、許可Hostで303、古い版で409）。
- docs/OPERATIONS.md（確認・承認・ジョブ管理の節を追加し、強制終了の手順を更新）、docs/STATUS.md、tickets/T033.md（done）。
- outputs/の実データ: jobs clean --applyで移動した（evidence/clean.txt）。

## 判断と理由
- 承認フォームは表示中の版のハッシュを送り、一致しなければ409にした。画面を開いた後に再生成された別の版を誤って承認しないため（SPEC「承認は完成物の版/ハッシュに結び付け、変更時に失効」）。
- POSTの検査を加えた。ブラウザーで他のサイトを開いているときに、そのサイトから127.0.0.1へフォームが送られる（CSRF）、またはDNSリバインディングで送られるのを防ぐため。サーバーは127.0.0.1だけで待ち受ける。
- 退避は削除ではなく移動にした。生成物の恒久的な削除を避け、元に戻せるようにするため。outputs/はGit対象外。
- Codex時代の引き渡しファイル（START-HERE.md、logs.zipなど）は、現在の状態と食い違うため直下から退避した。中身は_archiveに残っている。
- **エージェントの動作確認による記録**: bias-check-demo-9233f7b6の承認（HTTP）と14025babの差戻し（CLI）は、Claude Codeが動作確認のために付けた記録で、人の確認ではない。これらのジョブは試作の確認用で、公開候補ではない。今後の誤解を防ぐため--reviewerを追加し、運用文書にエージェント名を入れるよう書いた。
- Skill化の評価: 新しい定型手順はない。見送る。

## 検証コマンド・結果・証跡
証跡はevidence/（verification.txt、clean.txt、review.txt）に保存した。
- `--test` → 77件成功。`tsc --noEmit` → エラー0。
- `jobs clean`（表示のみ） → ジョブ5件（lint-ng-demo、M1初期のfailed4件）、ファイル8件。`--apply`で移動し、再度のcleanでは候補0件になった。
- HTTP: 他Originは403、古い版のハッシュは409、正しい版での承認は303で、状態はapprovedになった。CLIの差戻しは理由なしで拒否され、理由ありで記録されてrejectedになった。
- 組み込みブラウザー: 詳細画面で<track>が12件のcueを読み、5秒付近で字幕を表示した。各節も表示された。一覧では17件と確認状態が表示された。

## 未実施・制約
- YouTubeへの投稿はしていない（Publisherは無効のまま。T032で実装する）。
- 承認者の本人確認はしない（ローカル単独利用の前提）。
- ファイル変更による失効は単体試験でだけ確認した。実ジョブのmp4は書き換えていない。
- 確認画面のボタンをブラウザーで押す操作はしていない。同じPOSTをcurlで送って確認した。

## TODO・再開方法
- 次はT016（引き継ぎ文書docs/HANDOFF.mdと、README、SPEC、STATUSの更新）。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T016`。
