# 前回Codex実装のレビュー（T012）
- レビュー者: Claude Code / claude-opus-5-5 (runtime)、2026-10-08 UTC
- 対象: Codex / GPT-6 Astra（user-specified）が実装した src/{cli,tickets,worklog,worklog-cli,media,providers}.ts、scripts/{run,install-hooks,setup-media,render.swift}、.githooks/pre-commit、tests/{tickets,worklog,pipeline}.test.ts、tsconfig.json、outputs/の制作ジョブ記録、Git管理外の work/*.mjs/*.py、logs/内のCodexの作業記録
- 対象外: Claude Codeが今回の会話で追加した src/budget.ts、src/connections.ts、tests/budget.test.ts
- 再実行の結果（evidence/rerun.txt）: テスト28件成功・失敗0、tsc --noEmit エラー0、core.hooksPath=.githooks

## 総評
規模は小さく（src合計約230行）、ローカル限定・投稿無効・秘密除外の方針はコードに反映されている。作業ログの終了検査（SHA-256スナップショット、Git indexの検査、実際のpre-commitを使う試験）は設計・試験ともよくできている。
一方で、**作業記録の品質がこの検査の目的に追いついていない**（指摘1・2・4）。また、**制作ジョブの記録に事実と異なる値がある**（指摘3）。コード上の不具合はどれも軽微で、現行のM1動作には影響しない。

## 指摘（重大度順）
### 1. [中/プロセス] T008の作業ログがGit管理外のスクリプトで定型生成され、検証の記録になっていない
- 根拠: `work/close-ticket.mjs`（work/はGit除外）が次の4つを一括で行っていた。
  - チケットを`status: done`へ書き換える
  - STATUS.mdへ追記する
  - WORKLOG.md全体を固定文で上書きする
  - finishを呼ぶ
- 生成された logs/2026-10-08/193424-T008-35ed68f3/WORKLOG.md の問題:
  - 「検証コマンド・結果・証跡」が「実施内容」と同じ文の複製で、実行コマンドも出力もない。
  - 「判断と理由」は汎用文。
  - 「TODO」は「未実施」の複製。
  - 本文は「evidenceを参照」と書くが、evidenceディレクトリは存在しない。
- 影響: AGENTS.mdの「依頼・変更・判断・検証…を残す」を満たしていない。終了処理そのものが管理外コードで行われ、レビューできない。
- 事実確認: T008の主張（tsc エラー0）は今回の再実行で成立した。成果は正しいが、記録は不十分。
- 対処: 過去ログは改変しない（規約）。訂正はこの記録で行う。T013で、管理外スクリプトによる一括終了を規約で禁止するか、正規のコマンドとしてsrcへ移す。

### 2. [中/プロセス] T008終了の93ms後にT020を自動で開始し、記入しないまま放置した
- 根拠: T008の終了は 19:35:33.046Z、T020の開始は 19:35:33.139Z。WORKLOGは全節が TODO_WRITE のままだった。
- 影響: 次のエージェントで`check`と`start`が失敗した。今回の会話でpausedとして復旧済み（193533-T020-f544852c）。
- 対処: 開始は作業に着手するときだけ行う。自動で連鎖させない（T013で規約に明記）。

### 3. [中/記録の正確さ] job.jsonの接続種別が実際の描画経路と違う
- 根拠: src/cli.tsのNativeVisualは`kind='local.avfoundation'`。実際はAppKitでPNGを描き、FFmpegで書き出している（ADR-007でAVFoundationの書出しから置換済み）。
- 結果: outputs/*/job.jsonのprovidersは`local.avfoundation`、media-check.jsonのrendererは`AppKit + FFmpeg H264/AAC`で、記録が食い違っている。
- 影響: SPECの「接続種別を記録する」に対して誤った値が残る。後続の監査や再現で誤解を招く。
- 加えて、job.jsonに台本の版（plan.version）やFFmpeg・レンダラーの版がない。SPECの「版」はplan.jsonにしかない。

### 4. [中/検査の限界] 終了検査は「未記入でないこと」しか見ない
- 根拠: worklog.tsのreport()は、空欄・TODO_WRITE・「記入してください」だけを拒否する。tickets.tsは見出しがあるかだけを見る。
- 再現: 空の節を持つdoneチケットが受理された（evidence/rerun.txtのemptySections=accepted）。
- 影響: 指摘1のような複製文・汎用文でも通る。docs/AGENT-WORKFLOW.mdは「ログの真偽は証明しない」と限界を明記しているので、仕様どおりではある。ただし「全節を埋める」の実効性は低い。
- 対処案: 自動判定には限界がある。最低限、節どうしが完全に同じ本文なら拒否し、「evidence参照」と書いてあれば実在を確認する（T013）。

### 5. [低/不具合] work/renderがあってwork/render-sourceがないと、sampleがENOENTで落ちる
- 根拠: cli.tsの`!existsSync('work/render')||readFileSync('work/render-source')!==…`。work/render-sourceがなければ例外になる。
- 起きる場面: 手作業でwork/を部分的に消したとき。

### 6. [低/不具合] チケットの改行がCRLFだと解析できない
- 根拠: parseTicketの正規表現が`\n`だけを想定している。再現: CRLFにすると「front matterが必要」で拒否された（evidence/rerun.txt）。
- 影響: AGENT-WORKFLOWはWindows利用に触れている。autocrlfの環境ではcheck全体が失敗する。

### 7. [低] チケットのファイル名とidが一致するかを検査していない
- 現状の全チケットは一致している（確認済み）。将来の取り違えを防ぐ検査がない。

### 8. [低/保守性] scripts/render.swiftに置換前の残骸がある
- 使っていないimport（AVFoundation、CoreImage）と、使っていない変数`fps`がある。
- frame()の`progress`は常に1なので、進捗バーが常に全幅で描かれる（意図は未確認）。
- CVPixelBufferCreateの結果を確認せず強制アンラップしている。

### 9. [低] serveの制約
- ジョブIDの正規表現が`reflection-demo-`固定で、別の企画のプレビューができない。
- Rangeリクエストのたびに全ファイルを読み込む（36秒なら問題ない。長尺では非効率）。
- suffix range（`bytes=-N`）に対応していない。

### 10. [低] サプライチェーンと除外設定
- setup-mediaは版を固定しているが、ハッシュを検証していない（`--require-hashes`なし）。
- .gitignoreに`!outputs/.gitkeep`があるのに、ファイルが存在しない。

### 11. [低/試験不足] 重要な検査の試験が足りない
- media.encodeの検査処理（デコード、音声長、確認音のピーク）に単体試験がない（FFmpegが必要なため）。
- pre-commitはログ検査だけで、テストも型検査も走らない。

## 良い点
- 外部送信なし、127.0.0.1限定、Publisherは例外で拒否する。秘密・生成物をスナップショットから除外し、試験もある。
- 作業ログ検査の試験は、終了後の改変、証跡の追加、index不一致、実際のGit hookまで網羅している。
- validatePlanでIDと文字数を制限し、パストラバーサル（`../`）を拒否する試験がある。
- 失敗ジョブをfailedとして残し、latest.jsonは成功時だけ更新する。
