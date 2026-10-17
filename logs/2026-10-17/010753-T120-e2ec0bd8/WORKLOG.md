# 作業記録 T120
- 記録者・実施者: Codex
- モデル: gpt-6.1-sol (runtime)
- 開始日時: 2026-10-17T01:07:53.828Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
他の作業を進める: 再監査の再10としてREADME/SPECのsay・VOICEVOX・キュー・媒体検査・ベンチマークの古い現在説明を最新実装と検証境界に合わせる

## 実施内容・変更ファイル
- READMEの「読み上げ未実装」「キュー未接続」「T156未完了」を、最新実装とチケットへ照合し修正した。sayの実発話/cue超過停止、VOICEVOXの実エンジン未確認、キューのオプトイン接続、事実確認の版結合、T175実測と推計の境界を記載した。
- docs/SPEC.mdの現在の検証境界を2026-10-17へ更新し、M0/M1の過去仕様、T127の集計とT138の実WAV処理、T156媒体検査とT150/T158品質reviewを区別した。Runway依存の検討参照と方針未変更も残した。
- T120結果とSTATUSへ今回の範囲を追記。再監査の再10を文書で実施し、新規チケットや既存dependsの変更はしていない。

## 判断と理由
- 最新コードに接続済みの機能を未実装と案内すると、同じ実装作業を繰り返す原因になる。一方、ローカルTTSアダプターや媒体合格だけで、実声の採用/作品品質/公開まで完了したように案内しない。
- T156のチケットには過去失敗と後日の成功が両方残るため、2026-10-16の30秒実生成証跡を参照し、今回は再生成していないことを明記した。本人の採用/考察/承認・課金/投稿の方針には触れない。
- 定型作業評価: T120再監査/T170/T171/T175で状態と証跡の時点を分ける確認が反復しているが、既存task-work-units/repository-task-closeoutの実在確認と履歴区別に含まれる。今回は実装済み手順の直接適用で十分なためSkill更新/新設を見送り、新たな一般規則を増やさない。

## 検証コマンド・結果・証跡
- 開始直前のT175終了後 `./scripts/run src/cli.ts check` は155 tickets/161 sessionsで成功。対象T120・依存T108/T113・README/SPEC/STATUS/AGENT-WORKFLOWと、T156/T172/T179の現状を確認した。
- Python標準ライブラリでREADME/SPECのMarkdownローカル参照を検査。README21件/SPEC5件、欠落0、終了0（`evidence/document-verification.txt`）。T156の既存isolated-media-check.jsonを読み、status/fullDecode passed、720frames、映像/音声/コンテナ各30秒を確認。過去の証跡の再照合であり新しい動画生成ではない。
- `rg` でsample/produceのvoicevox/queue経路、共通承認のreadScriptFactCheck/hash、benchmarkのestimatedを確認し `evidence/source-references.txt` に保存した。
- `git diff --check` 終了0（`evidence/diff-check.txt`）。今回は文書のみの変更につき追加の実行試験は不要と判断した。直前のT175の422/422試験と型検査はその閉じた作業回の結果であり、今回の新試験には数えない。
- `scripts/agentctl status tsk_0mvbous1663772df46375 --require-metered` はmissing/usage空/終了4（`evidence/metering.txt`）。計測正常完了とは扱わない。

## 未実施・制約
- 実装・テスト・依存・採用方針・人の承認を変更していない。実Remotion再生成、VOICEVOX実接続、外部API/課金/投稿/commit/pushも行っていない。既存証跡の事実を現在の説明に揃えた範囲である。
- 全文書の歴史記録を一括書き換えてはいない。過去ログと再監査一覧は当時の記録として保持した。現状はtickets/STATUSを正本とする。
- 対話使用量は未計測のまま。閉じた過去ログの変更や数値の補完はしていない。

## TODO・再開方法
- 再10のREADME/SPEC整合は完了。T175は前の独立作業回で修正・実測を完了済み。次のagent課題はT179の実エンジン導入/起動条件と短文合成の調査、T167の題材別受入証跡などであり、全課題なしとはしない。
- ローカル音声やベンチマークを試す場合はREADMEの個別文書へ進み、外部一時領域・現行版への確認記録・本人採用の境界を守る。新しい作業は対象チケットの別startから始める。
- 計測は正規Hookの取込を待ってstatusで確認する。今回の終了後の訂正や追加結果は新しい作業回へ記録する。
