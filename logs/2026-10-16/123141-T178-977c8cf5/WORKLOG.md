# 作業記録 T178
- 記録者・実施者: Codex
- モデル: gpt-6.1-sol (runtime)
- 開始日時: 2026-10-16T12:31:41.628Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
今すぐできる作業を進める。T178の長尺台本構造・生成・一次資料照合ゲートを実装検証する。本人工程・実API課金なし

## 実施内容・変更ファイル
src/documentary.ts、src/documentary-cli.ts、fixtures/documentary-structure-demo.ts、tests/documentary.test.ts、prompts/documentary.mdを追加。script-drafting Skillへ長尺変換経路を追記。tickets/T178.mdとSTATUSを更新。既存Planのschemaを変えずdocumentary補助欄に指示/照合記録を持たせた。

## 判断と理由
5,000字と10〜20分は同義ではないため独立に検査する。入力段落はclaim/inference/fictionalに分け、照合原文のhash・URL・確認者・箇所が不足/変更/未確認なら拒否。生成器は外部APIや本人の代筆をしない。下書きはreflection-missingだけを残し、模擬考察の注入後に既存lintを通す。
定型作業評価: 既存script-draftingに長尺下書きの変換手順を追加して今回CLIで試用した。新規Skillは同目的の既存Skillがあるため作らない。routine-to-skillとrepository-task-closeoutの既存手順を適用。主張の照合設計はfact-and-rights-checkを参照したが、構造fixtureを原本照合済みの完成原稿とはしない。

## 検証コマンド・結果・証跡
開始時check/next成功。./scripts/run --test tests/documentary.test.ts は4/4成功（evidence/target-tests.txt）。./scripts/run --test tests/*.test.ts は398/398成功・失敗0（evidence/all-tests.txt）、TypeScript noEmit終了0（evidence/typecheck.txt）。CLIを一時ディレクトリで試用し5345字、6章、1060秒、reflection-missing 1件を確認（evidence/cli-demo.txt）。テストで模擬考察注入後のvalidatePlanV2/lintPlan成功・文字保存・未確認拒否・改変拒否・URL不一致・短長尺/不正設定を検証。
初回テストは構造fixtureの総尺1210秒で2/4失敗したため、話速上限を緩めずfixtureを7反復へ短縮して再試験した。scripts/agentctl status tsk_0mvay5fhh9f8acd725bd1 --require-meteredは終了4/missing（evidence/metering.txt）。usageを推測補完していない。finish後checkの実結果は応答で報告する。

## 未実施・制約
公開用の実題材5,000字原稿・本人考察/承認・動画生成は未実施。構造試験は反復する架空文であり、完成原稿の内容/リズム/二重学術フック品質の合格ではない。原本参照として2006年MusicLab論文の著者公開PDFを閲覧したが、構造fixtureの本文は研究成果の要約として扱っていない。2008年著者PDF/PMCは取得制約があり、fixtureの文献定義だけでverifiedを付けていない。有料API・契約・push・投稿なし。今回対話計測は未完了。

## TODO・再開方法
次は別作業回でT179/T185を実施する。実題材制作ではprompts/documentary.mdに従い本人選択済み題材の独自原稿と原本照合記録を入力し、produce reflection/scriptで考察を注入して再lint/本人承認する。文献の記録だけで主張確認を省略しない。
