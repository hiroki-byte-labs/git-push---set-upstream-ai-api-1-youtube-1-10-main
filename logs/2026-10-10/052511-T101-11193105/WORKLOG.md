# 作業記録 T101
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
利用者が実施する必要のあるタスクを優先度順に3つ、最小単元で作業できるよう日本語の指示書を作成する

## 実施内容・変更ファイル
- 開始前の確認
  - check: OK、69件。最新の記録は、Codexによる051825-T100。
  - Codexのレビュー（T093）で、修正チケットT094〜T099がagent readyとして追加されていた。人のreadyはT007、T015、T070、T089、T092で、変わっていない。
- tickets/T101.md（新規、done）。
- docs/HUMAN-TASKS.md（新規）
  - 上位3件（T070、T007、T015）の表（順、合計時間、理由）。
  - 記録の方法: 既定は、チャットに貼ってエージェントが記録する方式。
  - 事前準備: cdとNODE_BIN。
  - 各タスクの5〜15分の単位の手順、完了条件、回答のひな型、困ったとき。
  - 「この3件の後」と、付録「自分で記録する場合」（worklogのstartとfinish）。
- docs/STATUS.md: 先頭に指示書への案内を追加した。

## 判断と理由
- 選定と順序
  - T070（P0）を最優先にした。立場が未確定の間は、概要欄に「公開しないで」の注記が出る。量産コンテンツ判定のリスクを下げる方針の土台でもある（G19）。
  - 2番目はT007（P1、ready、約25分）にした。
  - 3番目はT015（P2）にした。T025、T027、T031もP1だが、status=backlogで、契約・課金・認証という利用者の費用判断を伴う。T015は10分で終わり、以後の変更を差分で追えるようにする（T093のレビューでも、初回コミットがないことが照合の制約になっていた）。
- 記録の方法: AGENTS.mdは人にも作業ログを求める。人がチケットや設定を直接編集するとcheckとpre-commitが失敗するため、「チャットに貼ってエージェントが記録する」方式を既定にした。人が自分で記録したい場合のために付録を残した。
- T007では、最新の機能（1080p、図解4種、サムネイル、概要欄）を見られるよう、`sample --plan fixtures/sample-v2.json --resolution 1080`の後に確認画面を開く手順にした。latest.jsonが出典検証用のジョブを指しているため、既定のserveの対象をそのまま見せないようにした。
- T015では、pushしないこと、--no-verifyを使わないこと、秘密・動画が含まれないことの確認を明記した。
- Skill化の評価: 「人の作業の指示書の作成」は初回で、反復の根拠がない。見送る。

## 検証コマンド・結果・証跡
証跡はevidence/command-check.txtに保存した。
- NODE_BINの実行ファイルが実在する。
- `parseSampleArgs(['--plan','fixtures/sample-v2.json','--resolution','1080'])` → {plan, resolution: 1080}。
- `git status --short --untracked-files=all`: .env、outputs、mp4、workは含まれない（.gitignoreの該当行をcheck-ignoreで確認した）。対象は282件。
- core.hooksPath=.githooks、pre-commitは実行可能。
- 参照するファイル10件が実在する。config/channel.jsonはdecided=false。
- worklogのmodel-sourceの許可値にunknownがある（付録の手順が通る）。
- この作業回がopenの間、checkは「未終了作業」で失敗した（想定どおり）。finish後に`./scripts/verify`を実行する。

## 未実施・制約
- 利用者の作業そのもの（T070、T007、T015）は未実施。
- コミットの実行は利用者の作業のため、pre-commitの通過はこの作業回では確認していない（finish後、一時indexでの確認を別途行う）。
- 指示書の所要時間は目安。

## TODO・再開方法
- 利用者がT070、T007、T015の回答をチャットに貼ったら、エージェントは新しい作業回で各チケットを記録する。T070ではconfig/channel.jsonも更新する。
- agentの作業はT094〜T099（Codexのレビューによる修正）。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `cli.ts next`。
