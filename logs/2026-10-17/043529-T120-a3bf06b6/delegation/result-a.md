# 抜き取り再監査 結果（T124 / T128 / T129 / T140）

読取専用で実施しました。ファイル変更、worklog、git 操作はしていません。4 本の関連試験は `./scripts/run --test` で 33/33 通りました。試験が通ることと、主張が成り立つことは別なので、以下は主張と実装の突合せです。

## T124（事実・権利確認Skill）判定: 軽微

**1. Skill が「素材の帰属表示を自動挿入する」と書いているが、実装がない**
- (a) 主張: `.agents/skills/fact-and-rights-check/SKILL.md` §2.1 に「帰属表示が必要な場合は台本メタデータ（概要欄出典リスト）に自動挿入する」とある。
- (b) 実際: `attributionRequired` を参照するのは `src/fact-check.ts` の検証部分だけ。`src/` の `metadata.ts` などから `attributionRequired` や `AssetRightRecord` を読む箇所は `rg` で見つからなかった。
- (c) 影響: 帰属表示が必要と記録した素材でも、概要欄にもレビュー対象にも反映されない。
- (d) 根拠: `rg -n "attributionRequired" src` の結果。
- (e) 確度: 確認済み。

**2. 素材の権利記録が、実際に使う素材と突き合わされない**
- (a) 主張: 使用する各素材（ピクトグラム・フォント・BGM）について入手元と許可根拠を確認する。
- (b) 実際: `src/fact-check.ts:67` は `assets` が 1 件以上あることだけを要求する。`src/script-fact-check.ts:25` の突合せは出典（source）用だけで、assets にはない。
- (c) 影響: 1 件の「original / commercialUseAllowed:true」を書けば `ok` になり、台本や制作が実際に使う素材と一致しているかは誰も見ない。台本承認時にこれが通る。
- (d) 根拠: `validateScriptFactCheck` に assets の照合がない。`draftScriptFactCheck` の仮ひな型 `production-assets-unreviewed` は `unknown` なので止まるが、書き換えれば通る。
- (e) 確度: 確認済み。ただし「記録できること」という受入条件の字面は満たしており、網羅性の保証がないという指摘。

## T128（段階連携・オーケストレーション）判定: 要修正

**1. `attachNarrationMetadata` / `advancePipelineStage` / `attachFactCheckReport` が制作経路に接続されていない**
- (a) 主張: 台本版ハッシュ照合つきの音声メタデータ検証と、`running` / `waiting_human` の進行制御を提供する。
- (b) 実際: 3 関数とも `src/` 内の呼出元がなく、使うのは tests だけ（`rg` で確認）。`produce render`（`src/commands/produce.ts:131`）は音声メタデータを要求しない。
  - `sample.ts` / `local-say-audio.ts` / `mock-audio-media.ts` は `audio-pipeline.ts` の一部だけを使い、`verifyNarrationLink` を通らない。
  - `narration.ts` の `NarrationMetadata` は `src/orchestration-pipeline.ts` の型 import 以外では使われない。
- (c) 影響: 音声が台本版と結び付いていなくても `produce render` は通る。「台本版ハッシュ不一致の拒否」は試験内の関数呼出しでしか効かない。
- (d) 根拠: `rg -n "attachNarrationMetadata|advancePipelineStage|attachFactCheckReport" src` に `src/orchestration-pipeline.ts` 自身以外の一致がない。
- (e) 確度: 確認済み。

**2. `advancePipelineStage` は何も実行せず、manifest に `running` を書くだけ**
- (b) 実際: `src/orchestration-pipeline.ts:236-247` は、`script` / `render` 段階で `status:'running'` を保存して「進行可能」を返すだけ。実際の工程は走らない。引数 `actor.by` も未使用。
- (c) 影響: manifest が実行中を示したまま何も動かない。完成動画が承認済みの `video-review` でも `running` を書く。
- (e) 確度: 確認済み。

**3. 受入条件「ステージごとの接続・費用・使用量記録」が実装にない**
- (b) 実際: `usage` / `attempts` を設定するコードが production 経路にない。`audio-synthesis` は `attachNarrationMetadata` のみ、`video-render` と `qa-inspection` は型に宣言があるだけで書込みなし。実際に manifest に書くのは `fact-check` と `script-review`（`produce.ts:109,129`）。
- (c) 影響: 版・実行情報の追跡が主張どおりではない。
- (e) 確度: 確認済み。

**4. manifest が失効しても `completed` のまま残る（軽微）**
- (b) 実際: `produce.ts:129-134` は承認時に `script-review: completed` を書く。台本が stale になっても更新も参照もされない。ゲートは `projectState` 側で、manifest は表示用なので誤承認にはならない。
- (c) 影響: manifest だけ見ると古い完了表示が残る。
- (e) 確度: 確認済み。

**5. 事実確認レポートの保存先が 2 つあり、片方は読まれない（軽微）**
- (b) 実際: `produce fact-check` は `fact-check.json` に書き、`attachFactCheckReport`（`orchestration-pipeline.ts:150`）は `fact-check-report.json` に書く。`readScriptFactCheck`（`src/script-fact-check.ts:34`）は `fact-check.json` を先に探す。
- (c) 影響: 両方が存在すると、後から書いた `fact-check-report.json` は無視される。
- (e) 確度: 確認済み（コード上）。

## T129（E2E）判定: 要修正（試験の主張と実際の検証範囲）

**1. E2E は全シナリオが demo モードかつ偽MP4で、媒体検査も本人名判定も通らない**
- (a) 主張: 「媒体検査と構造検査に合格」「必須承認を省略しようとする経路が拒否される」。
- (b) 実際: `tests/documentary-pipeline-e2e.test.ts` の 5 件はすべて `createProject(..., {demo:true})` を使い、`by` は `'test-agent'`。
  - `fakeRender` の動画は `Buffer.from('fake-mp4-…')`。ffprobe 等の媒体検査は呼ばない。
  - `sample.ts` / `produce render` を通らず、`job.json` を手書きしてから `linkRender` している。
  - 音声は `mockAudioConn` が返す偽パスで、レンダリングへ渡されない。`attachNarrationMetadata` は `sample.ts` / render へ接続されておらず、E2E 内で単体に呼ばれるだけ。
- (c) 影響: E2E の「完走」は、承認・失効の状態遷移と、モックを注入した各部品の組合せを確認しているにとどまる。媒体品質と、レンダリングと承認の連携は検証していない。
- (e) 確度: 確認済み。結果欄は「媒体検査」を明示的には主張しておらず、受入条件との乖離。

**2. 受入条件の「費用不明・再実行」シナリオがない**
- (b) 実際: 5 件は正常系・承認省略・事実確認ブロック・予算超過・失効。費用不明と再実行は E2E 内にない。
- (c) 影響: 実施範囲に列挙した再実行などが、このスイートでは未検証。
- (e) 確度: 確認済み。他の試験にある可能性はあるが、T129 の証跡としては確認できない。

**3. 「必須承認の省略拒否」と「成果物保護」の検証が弱い**
- (b) 実際:
  - 承認省略: `assertRenderable` が throw することと、`assessStagePrerequisites` / `advancePipelineStage` が `waiting_human` を返すことだけを確認する。
  - 予算超過: `synthesizeLongFormAudio` に低い `Budget` を渡して reject を確認し、その後 `existsSync(script file)` を見るだけ。パイプライン段階とは無関係で、成果物保護は自明に真。
- (c) 影響: 台本未承認の状態で `recordReview` などの別経路を通す検査は、このファイルにない。
- (e) 確度: 確認済み。

## T140（モック投稿）判定: 軽微

台帳・重複防止・応答喪失時の照合・quota/auth 停止は `src/mock-publisher.ts` の実装どおり読めました。
- 送信意図の台帳保存は `create` の前（l.101）。
- 照合を `create` の前に必ず行う。
- 上限は累計試行数で、再起動でリセットされない。
- `quota` / `auth` 停止は `ledger.stopped` に永続化される。
- 例外本文は保存しない。

**1. demo モードの承認済みジョブは `publishReadiness` なしで mock 投稿へ進む**
- (b) 実際: `src/mock-publisher.ts:62-63` の gate は `a.mode !== 'production' || publishReadiness(dir).ok`。demo ジョブはサムネイル検査等を問われず、`approvalOf` が `approved` なら mock の `published` を返す。
- (c) 影響: demo だけが対象で、チケットにも「デモはmock試験専用」とある。実投稿経路ではないため実害は小さい。
- (e) 確度: 確認済み。結果欄の記述と一致しているので軽微。

**2. 同一ジョブの別版は、先の送信が未確定のままだと永久に拒否される**
- (b) 実際: l.67 の `job-already-recorded` は、先のエントリが `uncertain` のままでも、再承認した別の bundleHash を拒否する。
- (c) 影響: 二重作成防止としては安全側で、手動で台帳を整理するまで進めない。チケットの運用制約欄にも手動復旧の記載がある。
- (e) 確度: 確認済み。

## 本人工程の代行・迂回に関する共通の指摘（T128/T129 に関係。判定は軽微）

**1. 承認の本人判定は自己申告の名前と正規表現だけで、ログ上の識別子も人名として扱われる**
- (b) 実際: `src/production.ts:35` の `AGENT_NAME` と `checkBy` で、本番案件でエージェント名を拒否する。コメントどおり安全網で、認証ではない。
- 実測した判定:

  | 名前 | 判定 |
  |---|---|
  | `cli-user` / `local-user` | false（通る） |
  | `assistant` / `c1aude` | false（通る） |
  | `claude-code` | true（拒否） |
  | `Abbot` / `Magenta` / `Talbot` | true（人名でも拒否） |

- (c) 影響: 完成動画の承認 `recordReview` で `--reviewer` を省略すると、CLI は `cli-user`（`src/cli.ts:98`）、HTTP は `local-user`（`src/commands/serve.ts:226`）が既定になり、本番でも通る。エージェントが名前を言わずに承認すれば、台本承認（`--by` 必須）と違い、動画承認の記録は人間の既定名として残る。一部の人名（Magenta 等）が誤って拒否される。
- (d) 根拠: 上記の実測。`recordReview` の本番時チェック（`src/review.ts:166`）は `isAgentName(reviewer)` だけ。
- (e) 確度: 確認済み（`isAgentName` の戻り値を実行して確認）。

**2. 事実確認の `verified` も自己申告で、確認者を問わない**
- (b) 実際: `produce fact-check --report` は誰でも `status:'verified'` のレポートを書ける。URL が台本の `sources` と一致すれば通り、`--by` は使われない。
- (c) 影響: 人が台本承認時に内容を見ていなければ、エージェント自作の「確認済み」で承認条件が満たされる。台本承認画面（`serve.ts`）には事実確認の表示が見当たらない（`rg -n "fact|事実" src/commands/serve.ts` で一致なし）。
- (e) 確度: 確認済み（コード上）。

## 承認失効の漏れ確認（問題なし）

次の変更は、いずれも失効または再承認要求になることをコードで確認しました。
- 台本ファイル・題材・考察の版の変更は、`projectState` が `stale` / `broken` にする（`production.ts:195-199`）。
- 事実確認レポートの変更は、`factCheckHash` 不一致で `pending` に戻る（`production.ts:211`）。
- 動画・字幕・メタデータ・サムネイルの変更は、`bundleHash` 不一致で `expired`。
- 台本の変更は、動画側の `scriptMismatch` で `expired`。

## 全体の要約

1. 本人の承認ゲート（題材・考察・台本・動画）と失効条件は `production.ts` / `review.ts` に実在し、台本・考察・事実確認・動画の変更で失効する。mock 投稿台帳の重複防止と応答喪失時の照合も記載どおり実装されている。
2. 一方で T128 の音声メタデータ検証・進行制御・使用量記録は制作経路に接続されておらず、T129 の E2E は demo・偽MP4・手書き `job.json` で、媒体検査・再実行・費用不明は検証していない。
3. 本人性の保護は名前の正規表現（人名の誤拒否あり）と、動画承認で `--reviewer` 省略時に `cli-user` / `local-user` で通る点が実害に近い。事実確認の `verified` と素材権利も自己申告で、使用素材との突合せがない。

注: このセッションは Plan モードでしたが、依頼内容が読取専用の監査のため、計画ファイルは作成せず結果だけ返しています。