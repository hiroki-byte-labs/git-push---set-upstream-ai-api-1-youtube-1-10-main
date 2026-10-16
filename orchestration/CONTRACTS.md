# ファイルの受け渡し契約 v1

JSON Schema draft-07を `schemas/` に保存し、固定版Ajv 8.20.0で構造を検査する。`contracts.ts` の `parse(kind, value)` は構造と意味を検査し、不備があれば `ContractError` を投げる。型は `AnalysisContract`、`Evaluation`、`ImprovementTasks`。`schema_version` は `"1"`、`artifact_id` は成果物の一意のID。既存IDの上書き、成果物ファイルのハッシュ、別成果物への参照は受け渡し処理側でも検査する。

| kind | 推奨ファイル名 | Schema |
|---|---|---|
| analysis | animation-analysis.json | schemas/animation-analysis.schema.json |
| evaluation | evaluation.json | schemas/evaluation.schema.json |
| tasks | improvement-tasks.json | schemas/improvement-tasks.schema.json |

全フィールドが必須で、未知のフィールドは拒否する。取得できない値は `null`、実施できなかった観測は空配列と `limitations` に理由を記録する。未観測を0や成功で埋めない。confidenceは0〜1またはnullで、値を入れる場合は根拠を説明する。自動計算された確率ではない。

解析の `complete` はメタデータ・場面・証跡が揃った状態。`partial` は制限の理由が必要。`unavailable` はメタデータをすべてnull、観測配列を空にし、観測したと誤解される記述を作らない。YouTubeページを開いたことをフレーム解析の証跡にはしない。

`evidence` の各要素はid、実行ディレクトリからの相対POSIXパス、SHA-256、フレーム番号（該当なしはnull）、説明を持つ。絶対パス・`.`・`..`・空パス成分・バックスラッシュは禁止。実ファイルの存在とハッシュ一致は受け渡し層で検査する。場面、物体、動きの参照と証跡IDは同一ファイル内でも検査する。タスクの証跡IDは対応するevaluationの証跡を参照する。

数値指標は全て**誤差（小さいほどよい）**として扱う。閾値は正の数、誤差値は0以上、`pass = value <= threshold`。未知の場合、basisはunknown、value/passはnull。実測値はdirect_frames比較で、フレーム番号のある証跡を最低1件引用する。位置・サイズ・色・開始/終了時刻・移動量・速度変化・フレーム変化をaxisで区別する。指標の単位・計算法・閾値プロファイルを結果に残し、異なる計算法を同じ数値として比較しない。

作品としての評価は `qualitative_findings` に分離する。自然さ、読みやすさ、一貫性、テンポ、分かりやすさは1〜5またはnull。点数を付ける際は担当者名・理由・フレーム証跡を必須とする。実測再現度と混ぜて「自動で芸術的品質を保証」と報告しない。未実施レビューはnullと理由を残す。

依存取得は `pnpm --dir orchestration install --frozen-lockfile --ignore-scripts`。Node.js 24以上で `node --test orchestration/contracts.test.ts`。TypeScript開発依存はリポジトリルートの固定版を利用し、`node node_modules/typescript/bin/tsc --noEmit -p orchestration/tsconfig.json` で確認できる。API・契約・キーは不要。
