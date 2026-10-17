# 中核done（T124〜T156）抜き取り再監査の照合結果（親による確認）

子3件（claude-sonnet-5-5、agentctl run、read_only）の報告は delegation/result-{a,b,c}.md にある。以下の判定は、親がコードと最小再現で確かめたもの。

## 要修正（親が確認済み）

**T104/T095系: 本番の完成動画承認で記録者名を省略すると、既定名で通る**
- CLI `review <id> approve` は、`--reviewer` を省略すると `cli-user` で記録する（src/cli.ts）。serve は、確認者名が空欄なら `local-user` で記録する（src/commands/serve.ts）。
- `isAgentName('cli-user')` と `isAgentName('local-user')` は false なので、本番でも通る。エージェントが名前を書かずに承認すると、人の既定名で記録が残る。
- `AGENT_NAME` は `agent` に単語境界がない。このため、`Magenta` などの人名を誤って拒否する（node で実測、`isAgentName('Magenta') === true`）。

**T158/T155系: checkReadability が空の記録・欠測の記録を合格にする**
- `render-report.json` が `[]` でも `{"ok":true,"minFont720":0}` を返した（node で再現）。

**T127: checkSubtitleSync が NaN の音声長を合格にする**
- 子の報告と、src/audio-pipeline.ts の `?? 0` と比較式で確認した。親は再現スクリプトを実行していない。
- 同期検査と音量検査は mock-audio-media からしか呼ばれず、`--audio say` の制作経路では検査していない（子の報告を `rg` の結果で確認）。

**T013系（verify）: ルートの `./scripts/verify` が motion-lab の試験33件を実行しない**
- T152〜T154・T187 の主要試験はここにあり、回帰を検出できない。`cd motion-lab && node --test tests/*.test.ts` を親が実行し、33件すべて合格した。

## 記録だけするもの（構造・範囲の問題）

**T128: 制作経路に接続されていない**
- `attachNarrationMetadata`、`advancePipelineStage`、`attachFactCheckReport` は試験からしか呼ばれない。
- 受入条件の「ステージごとの接続・費用・使用量の記録」も実装がない。

**T129: E2E の検証範囲が狭い**
- 5件ともデモで、偽MP4と手書きの job.json を使う。媒体検査・費用不明・再実行は検証していない。

**T124: 素材の権利記録が使用素材と照合されない**
- 素材の権利記録は、実際に使う素材と突き合わされない。
- 帰属表示の自動挿入は実装がない。

**T140: 軽微のみ**
- デモは publishReadiness なしで mock 投稿へ進む（記載どおり）。

**T125、T152〜T154、T156: 問題なし。T126、T138、T139、T155（網羅）: 軽微**
- 子の報告による。親は深掘りしていない。
