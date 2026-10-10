# T009: 追跡ログ整備
- 記録日: 2026-10-08 / America/Los_Angeles。保存時刻はmetadata.json。
- 実施者・記録者: Codex / GPT-6 Astra（ユーザー指定のモデル名）。
- 記録種別: 今回作業は同時記録、001-m0-m1は回顧記録。
- ユーザー依頼: 作った内容・TODO・指示を他AIがトレースできる詳細ログと、誰が記録したかの表示。
- 対象: T009。依存T001/T002は開始時done。

## 開始時確認
AGENTS.md、README.md、docs/SPEC.md、docs/STATUS.md、T006/T007/T020/T030と依存を確認。checkは16件成功、nextはhuman=T007、codex=T020/T030、review=T006。Gitは既存成果物が未追跡の初期状態。既存コード・生成動画は変更しない。

## 追加と変更
- logs/README.md: 索引、ログの正本/スナップショット区別、継続方法、記録者表示の根拠。
- logs/TEMPLATE.md: 記録者・モデル・日時・依頼・変更・判断・試験・TODO・再開のひな型。
- 001-m0-m1/USER-INSTRUCTIONS.md: 初回要件U01〜U09、再試行許可U10、今回依頼U11、規約再提示U12。要約と原文引用を区別。
- 001-m0-m1/WORKLOG.md: 調査、権限、実装、失敗、代替案、生成・検証・残件、ファイルと要求の対応。
- 本ディレクトリ/TODO.md、tickets-snapshot.txt、next-snapshot.txt: チケットから生成した時点記録。手動の別管理台帳ではない。
- evidence/: 今回実行したcheck/next、既存検証資料のコピー。動画生成を再実行した証拠ではない。
- repository-manifest.json: 記録終了時の関連ファイルのSHA-256とサイズ。ログ自身は循環を避け対象外。
- metadata.json: 記録者、モデル名の情報源、タイムゾーン、記録時刻、対象チケット、履歴の限界。
- T009追加、AGENTS.mdに継続記録、README/STATUSに導線追加。
- outputs/logs.zip、outputs/source.zip、outputs/LOGS-INDEX.md: 引き渡し用コピー。リポジトリのlogs/が正本。

## 検証と結果
関連ファイルの存在、相対リンク、スナップショットとチケットの対応、マニフェストの一致、チケットcheckを確認。具体的なコマンド出力はevidence/check.txtとlog-validation.txt。
コードや動作の変更を伴わないため、動画再生成と既存の12テストは今回再実行しない。12件成功は初回のdocs/VERIFICATION.mdの記録であり今回の試験と混同しない。

## 残件と再開
T006はreview、T007はreadyのまま。今回の環境情報でファイルシステム権限が変わったが、保存済みブラウザー拒否設定の解消は未確認。今回ブラウザーを再試行していない。T020/T030は着手可能だが今回のログ依頼では着手していない。次回はREADME→SPEC→STATUS→対象チケット→check/next→logsの順に確認。

## 記録の限界
初回操作の全時刻・全ツール出力の復元ではない。モデル名はユーザー指定。公開・課金への追加承認ではない。動画と秘密値はログへ含めない。
