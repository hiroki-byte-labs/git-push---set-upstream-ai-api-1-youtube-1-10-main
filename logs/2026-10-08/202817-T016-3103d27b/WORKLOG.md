# 作業記録 T016
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
エンハンス一括実施の引き継ぎ文書（docs/HANDOFF.md）作成とREADME/SPEC/STATUS等の更新。他のAIエージェントが理解できるように。コード変更なし

## 実施内容・変更ファイル
- docs/HANDOFF.md（新規）: 次の章で構成した。
  - 0 読む順番と再開の最短手順
  - 1 チケット別の要点と主なファイル
  - 2 制作の流れ図
  - 3 データ形式（Plan v2、job.json、media-check.json、review.json）
  - 4 コマンド早見表
  - 5 壊してはいけない不変条件7項目
  - 6 既知の制約・未実施
  - 7 記録の訂正・注意
  - 8 作業ログの一覧
  - 9 次の作業
- README.md: 先頭にHANDOFFへの案内を置き、生成・確認の節をv2、lint、確認画面、字幕選択、jobs/reviewに更新した。
- docs/SPEC.md: 「台本形式v2と制作の検査」の節を追加した。
- docs/DECISIONS.md: ADR-014（エンハンスの主な判断）。
- docs/ASSETS.md: v2のfixtureと描画経路（AppKit＋FFmpeg）を追記・訂正した。
- docs/STATUS.md: T016の完了と「現在地（エンハンス後）」を追加した。
- tickets/T040.md: ローカル部分の実施状況と残りを記録した（statusはbacklogのまま。T022への依存は変えていない）。
- tickets/T016.md（done）。

## 判断と理由
- 引き継ぎ文書は「時点の要約」と明記し、正本はtickets/STATUSとした。規約で、ログやTODOは時点の履歴、現在状態はticketsが正本とされているため。
- 不変条件を独立した章にした。後続のエージェントが変更時に壊しやすい点（v1画像の互換、フレームの整数性、安全検査の位置、承認の結び付き、mock/realの区別、outputsを削除しないこと、作業記録）を1か所で確かめられるようにするため。
- 記録の訂正（T043のフレーム数など）は、閉じた過去ログを改変せず、この文書とT044のログに書いた（規約）。
- T040は親チケットのため、依存（T022）と状態は変えず、本文だけ更新した。
- Skill化の評価（routine-to-skill）: 今回、「チケット作成→1チケットずつ開始・実装・検証・証跡・チケット/STATUS更新・WORKLOG・finish・check」を8回繰り返した。この流れは既存のrepository-task-closeoutの範囲内で足りた。一方、「複数チケットの連続実施で、毎回STATUSを更新する」点は、T014で一度漏れた。repository-task-closeoutはすでに手順2でSTATUSの更新を求めているため、Skillの変更ではなく実施側の漏れと判断し、Skillは更新しない。新規のSkillも作らない。

## 検証コマンド・結果・証跡
証跡はevidence/handoff-walkthrough.txtに保存した。
- `--test` → 77件成功。`tsc --noEmit` → エラー0。
- `cli.ts next` → human: T007、T015。agentはなし（人の作業待ち）。
- `cli.ts lint`（v1）と`lint --plan fixtures/sample-v2.json` → どちらもerror 0。
- `jobs` / `jobs clean`（候補0件） / `review bias-check-demo-9233f7b6`（approved） / help → 文書の記載どおりに出力された。
- 文書が参照するファイル16件と作業ログ8件の実在を確認した。
- `./scripts/verify`（checkを含む）は、この作業回がopenの間は失敗するため、finish後に実行して確認する。

## 未実施・制約
- 別のエージェントが、この文書だけで実際に再開できるかの追試はしていない。
- 文書の数値（テスト件数、フレーム数など）は2026-10-08時点の値。
- 最初の利用者の依頼のうち、Git初回コミット（候補14）は人の作業（T015）として残した。作成者名の選択が人の判断のため。

## TODO・再開方法
- 人: T007、T015、T025、T027、T029、T031。
- エージェント: 人の作業の完了後にT026、T028、T060、T032。docs/HANDOFF.mdの9章を参照。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `cli.ts next`。
