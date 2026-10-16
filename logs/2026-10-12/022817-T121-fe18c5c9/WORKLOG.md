# 作業記録 T121
- 記録者・実施者: Codex
- モデル: gpt-5.6-sol (runtime)
- 開始日時: 2026-10-12T02:28:17.379Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T121をClaude CodeからPMとして引き継ぎ、Codexデスクトップ0.162.0-alpha.2のnative subagentモデル注入、コスト削減実測の拡大、Antigravity子の既存記録、database is locked再発、完成条件1〜10を再判定し、必要な保守変更・検証・記録・終了処理を行う

## 実施内容・変更ファイル
- Codexデスクトップ同梱 codex 0.162.0-alpha.2 で、モデル指定なしの explorer サブエージェントを1回だけ起動した。HookがL1/extractionとして gpt-6-luna を注入し、親子関係・実モデル・使用量を確認した。
- `docs/agent-routing/pending-fixes-10.patch` を一時コピーで検証し、`agentctl maintenance apply` で適用した。Codexのnative_subagentsへデスクトップ版の確認根拠と `verified_app_version` を追加し、doctorがCLI版とデスクトップ同梱版を別々に判定するようにした。
- 25種類の決定的な小課題を軽量開始・標準開始で各25回、合計50回Gateway実行した。全実行を `agentctl status --require-metered` で確認した。
- `optimize due`→`propose`→PM review→`apply` を実行し、方針を2026-10-12.1へ更新した。extraction/L1は品質要求normalでもstandard開始となる。旧版は `data/policy-history/` に保存された。適用後に `agentctl init` でHook基準を更新した。
- 方針変更で旧モデル固定のHook試験5件が失敗したため、`orchestration/tests/hooks.test.ts` を現在のRouter選択に追従する試験へ変更した。現在の選択を子へ適用し、別モデルを不一致として検査する。
- `docs/agent-routing/verification-report.md`へ追記6と完成条件1〜10の再判定、`architecture.md`へCLI版とデスクトップ同梱版の別管理、`tickets/T121.md`と`docs/STATUS.md`へ結果と再開地点を記録した。
- 定型作業評価: 2026-10-12の各4件のpilotと今回の各25件で比較実測が反復したため、新規Skillは作らず既存 `.agents/skills/routing-optimizer/SKILL.md` に、対比較・購読枠見積り・決定的試験・計測確認・品質下限のreview手順を追記した。

## 判断と理由
- コスト実測の開始時点は extraction/L1 の軽量開始・標準開始が各4件（両方4/4合格）。Optimizerのtriggerは前回提案後50実行で、`optimize due` は0/50・false。
- 実測計画: 同じ25課題を軽量開始と標準開始で1回ずつ、計50実行する。課題は算術、文字列抽出、分類、並べ替え・変換、書式化の5種類×5件。各実行は `answer.txt` と完全一致試験で合否を決め、L1/extractionの比較群を各29件（既存4+追加25）にする。50実行で `optimize due` の閾値にも到達させる。
- 購読枠の見込み: 追加50ターン。既存4件ずつの平均から、軽量約108万トークン・標準約99万トークン、合計約207万トークンを見込む。API相当額の目安は約$0.88（軽量約$0.054、標準約$0.823）だが、実行はChatGPT購読枠で実請求額は取得不能。再試行・上位切替えがあれば増える。課金APIは使わない。
- 実測追加分は軽量17/25合格、標準24/25合格。既存分を含む29件ずつでは軽量の合格率0.72・$0.002069/合格、標準0.97・$0.035368/合格。軽量は安いが方針の最低合格率0.90を下回るため、提案 `prp_0mv4n6i056174d8de9c2c` をPMとして承認・適用した。
- `optimize check` は適用後の実績が0件のため劣化判定対象なし。次回の実績がたまるまで自動復元は行わない。
- 完成条件1〜10は条件4だけ一部未達。Codex・Claude・Gateway経由Antigravityの子は追跡できるが、Antigravity対話中の子を `ANTIGRAVITY_CONVERSATION_ID` で親へ結び付けた実データがない。このためT121をdoneにせずreviewのままにした。

## 検証コマンド・結果・証跡
- 開始: `./scripts/run src/cli.ts check` → OK（90 tickets、未終了なし）。`next` → T121 review。`worklog-cli.ts start` → 本作業回を作成。
- native subagent: explorerをモデル指定なしで1回起動し「OK」。`./scripts/agentctl status exe_0mv4muiyy0c5927f48ce3 --require-metered` → completed、native_subagent、managed、gpt-6-luna、39,901トークン measured。子rolloutのHook適用後 `turn_context.model` もgpt-6-luna。証跡 `evidence/native-subagent.json`。
- 保守: 一時コピーで79件・型検査合格、`git apply --check` 成功。`./scripts/agentctl maintenance apply docs/agent-routing/pending-fixes-10.patch` → applied=true、copy/mainの試験・型検査すべてok、codex_retrust_required=false。
- 実測: `work/agentctl-expanded/` の25対をGatewayで実行。`verify-expanded.mjs` が各executionへ `agentctl status --require-metered` を行い、50/50 measured。軽量922,213トークン・$0.034824、標準995,820・$0.858604。証跡 `evidence/cost-expansion.json`。
- Optimizer: `optimize due` → 50/50、true。`optimize propose` → proposed。`optimize review ... --decision approve --reviewer codex-pm` → approved。`optimize apply` → 2026-10-11.1から2026-10-12.1。適用後のplanはgpt-6.1-solを選択。`optimize check` → ok、after n=0、rolled_back=null。
- 最終試験: 最初の全試験は方針変更により旧期待値5件が失敗（74/79）。試験修正後 `node --test orchestration/tests/*.test.ts` → 79/79合格、exit 0。`node node_modules/typescript/bin/tsc --noEmit -p orchestration/agentctl.tsconfig.json` → 診断なし、exit 0。証跡 `evidence/final-tests.txt`。
- doctor: version_codex_app、hook_baseline、unmetered_managedはいずれもok。hook-errorsは過去のdatabase lock 1件・7行だけ。証跡 `evidence/remaining-checks.md`。
- 使用量: `./scripts/agentctl usage --by model --since 2026-10-12T02:28:17Z` → 本作業のCodexはgpt-6.1-sol 995,820トークン・$0.858604（25実行）、gpt-6-luna 962,114・$0.038571（benchmark 25＋native 1）、unmetered 0。同時間帯のAntigravity high 593,205トークンは別の同時作業。証跡 `evidence/usage-by-model.json`。

## 未実施・制約
- Antigravity対話中のサブエージェントの実機bindingは未確認。doctorは `agy_payload_keys=2` だが `agy_child_session_bound` はなく、statusの既存子3件はGateway親に属する。
- `database is locked` は再発していないため、原因の追加特定はしていない。再発時に時刻・イベント・並行書込みを記録する。
- 購読枠の実請求額は製品から取得できない。記録したUSDは登録単価によるAPI相当額で、請求額ではない。従量課金API、契約、push、投稿は実施していない。
- `agentctl usage --by model` は共有DBの集計で、同時刻に他製品が実行した使用量も含む。今回起動したexecutionは個別statusと作業開始時刻で分けた。

## TODO・再開方法
- 利用者がAntigravityの対話でサブエージェントを使った後、新しいT121作業回を開始し、`agentctl doctor` と対象executionの `agentctl status --require-metered` を確認する。
- `agy_payload_keys.env_conversation_is_self`、`agy_child_session_bound`、子の親execution、実モデル、metering_statusが実データで揃ったら verification-report追記、T121、STATUSを更新し、完成条件4とT121 doneを再判定する。揃わなければreviewを維持して実際のHook入力・環境変数を記録する。
- hook-errors.logに新しい行が増えた場合は、database lockの再発として同時書込み経路を切り分ける。今回の方針適用後は実績が10件以上たまった段階で `agentctl optimize check` を再実行する。
