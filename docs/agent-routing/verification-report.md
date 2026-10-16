# 最終検証レポート（T121、2026-10-11 UTC）

実施: Claude Code（claude-opus-5-5、デスクトップアプリのセッション）。証跡は `logs/2026-10-11/112432-T121-e0af6838/evidence/`。
**実装したことと、実機で強制動作を確認したことを分けて書く。** 「模擬」は自動テスト（模擬CLI・各製品の公式仕様の形式のHook入力）、「実機」はこのMac上の実際の製品での確認。

## 1. 結論
- 3製品共通の実行経路（`scripts/agentctl run`）では、承認なし・承認と異なるモデル・計測無効・再帰の実行を拒否し、使用量を取得方法つきでSQLiteへ記録することを、模擬CLIを使った結合テストで確認した（59件合格）。
- **Claude Code**は、このセッション自身にプロジェクトHookが即時に読み込まれ、AI CLIの直接起動、承認鍵の読み取り、計測DBの変更、Hook迂回の起動指定、保護ファイルの編集、方針と違うモデルのサブエージェントを**実機で拒否**した。モデル未指定のサブエージェントにはHookが `haiku` を注入し、実際にclaude-haiku-5-5で動き、子の使用量65,998トークン（measured）を記録した。
- **Antigravity**は、このフォルダの `.agents/hooks.json` を実機で読み込んでいる（`agy -p "/hooks"`、クォータ消費なし）。対話・サブエージェントでの動作は模擬入力でのみ確認。
- **Codex**は、利用者がプロジェクトとHookを信頼するまで `.codex/hooks.json` を読まない仕様。
- よって完成条件のうち、Codex・Antigravityの実セッションから始めた場合の確認（条件1・3の実機部分）は未達。成功とは報告しない。

### 追記（2026-10-11 12:19〜12:40 UTC、作業回 123255-T121-3f625c6e）
- 利用者が修正パッチを適用し（内容は検証済みパッチと一致を確認）、Codexでプロジェクト・Hookを信頼し、`agentctl init` で基準を更新した。適用後のテストは61件合格。
- **利用者の許可により、Gatewayから実モデルを各1回実行した**（購読枠、API課金なし、最小のプロンプト「OKとだけ返す」、再試行・上位切替えは0回に設定）。証跡は `logs/2026-10-11/123255-T121-3f625c6e/evidence/real-runs.txt`。

| 項目 | Codex（`codex exec`） | Antigravity（`agy -p`） |
|---|---|---|
| Routerの選択 | gpt-6-luna（light、low）。used_llm=false | gemini-3.8-flash-low（light） |
| 承認 | Gatewayが発行し起動直前に1回だけ消費 | 同左 |
| 子セッションのHook | **実製品のSessionStart Hookが発火**し、承認と実モデル（gpt-6-luna）の一致を記録 | **実製品のPreInvocation Hookが発火**し、承認と実モデル（modelName→gemini-3.8-flash-low）の一致を記録。Gatewayの環境変数がHookまで届くことを確認 |
| 結果 | 応答「OK」、completed、10.3秒 | 応答「OK」、SUCCESS、13.2秒（製品の計測では3.6秒） |
| 使用量（measured） | 入力18,780（うちキャッシュ6,912）、出力5、推論0、合計18,785。rolloutの応答単位。`turn.completed` の累積値と一致し二重計上なし | 入力15,028、出力1、思考0、キャッシュ0、合計15,029 |
| 費用 | API相当額は単価未確認のためnull。実請求は購読枠で取得不可 | API相当額 $0.011275（推定、Gemini APIの単価）。実請求は購読枠で取得不可 |
| 計測確認 | `status --require-metered` exit 0 | 同左 |

- 利用者自身のCodex対話セッション（gpt-6-astra）でUserPromptSubmit Hookが発火し、Routerの推奨（L2/general → gpt-6.1-sol）を記録した（**TEST-001の実機確認**。本文は保存せず文字数とハッシュのみ）。このClaude Codeセッションでも、利用者の発言でUserPromptSubmitが発火し、推奨（claude-sonnet-5-5）が記録・表示された（TEST-002の残り部分）。
- Antigravityの結果JSONにはモデルIDがないため、Gatewayは「照合不能」と記録していた。試験後にGatewayを修正し、子セッションのHookの照合結果（一致・不一致）を最終判定に使うようにした（テスト追加、62件合格）。実機での再実行は「各1回」の許可範囲を超えるため行っていない。
- 監査（`doctor --audit`、Hook導入以降）では、Codexの2セッション（利用者の対話・試験の子）がともに観測済みで、未観測のセッションは0件。
- 完成条件の再判定: 条件1（Codexから開始→Router）は実機で成立。条件3（Antigravityから開始）は、Gateway経由の子セッションでのHook発火と照合は実機で成立したが、Antigravityの対話セッションから始めた場合（PreInvocationでの推奨記録）は実機未確認のため、引き続き未達として扱う。

### 追記2（2026-10-11 12:56〜13:40 UTC、作業回 125613-T121-e7fb5415、利用者の指示で中断）
- **Antigravityの許可設定を「常に許可」に変更**（利用者の指示）。`run_command`・`invoke_subagent` 等で、Hookが拒否しない操作は `decision: allow`（以前は `ask`）。AI CLIの直接起動・保護対象への操作は引き続き `deny`。利用者が `docs/agent-routing/pending-fixes-2.patch` を適用（検証済みパッチと一致、テスト64件合格）。影響: このフォルダのAntigravityの全セッションと `-p` で、拒否されないコマンドは確認なしで実行される。
- **サブエージェントの実機試験**（利用者の許可、購読枠、証跡 `logs/2026-10-11/125613-T121-e7fb5415/evidence/real-subagents.txt`）:

| 製品 | 結果 |
|---|---|
| Codex（2回） | `explorer` が実際に起動・完了し、SubagentStart/Stop のHookが発火。子は親の実行（Gateway）に結び付き、使用量18,583トークン（rollout、measured）。ただし起動前のPreToolUseで子を事前登録できず「管理外の子」として記録、モデルは親（gpt-6-luna）を継承し、Routerのモデル注入は働かなかった |
| Antigravity（1回） | `invoke_subagent` のPreToolUse Hookが発火し、親に結び付いた子の実行を記録（Routerの推奨 gemini-3.8-flash-medium は記録のみ）。子の会話のHookも発火し、実モデルは gemini-3.8-flash-low（親と同じ）。子単独の使用量は製品が出さず `missing`（親の合計62,393トークンに含まれるかは未確認） |

- **原因（Codex）**: Codex 0.161の協調ツールは名前空間つきで、Hookには `collaborationspawn_agent` という区切りのない名前で渡る（13:34 UTCの利用者のCodexセッションで記録）。修正パッチの判定式は区切り文字を前提にしていたため一致しなかった。また2回目の試験時は、変更したHookが未再信頼でCodexに読み飛ばされていた（13:32 UTCに利用者が再信頼済み）。
- `doctor` に、`.codex/hooks.json` の変更後にCodexの信頼の記録が更新されていない状態の警告（`hooks_codex_retrust`）を追加（テスト65件合格）。
- 再開時の作業: `orchestration/hooks/hook.ts` の `SPAWN.codex` を `/spawn_agent$|^Agent$/` にする1行の修正パッチを用意して利用者が適用（`.codex/hooks.json` は変えないため再信頼は不要）→ Codexのサブエージェント試験を1回。

### 追記3（2026-10-11 14:13〜16:40 UTC、作業回 141326-T121-a8040365）
- 間にCodex（gpt-6-astra、作業回 134708-T121-989ab57e）がCodex内でサブエージェントを1回起動していた（子は管理外、判定式が未修正のため）。また、Codexのサンドボックス内から `agentctl run` で `codex exec` を起動すると `Operation not permitted`（app-serverの初期化に失敗）で動かないことが記録された。Gatewayから別製品を起動する作業は、サンドボックス外（人の端末、Claude CodeのBash等）で行う。
- **方針①**: AGENTS.md・model-router・token-monitor の各Skillに「別モデルや計測が必要な子作業は `agentctl run`」を追記。
- **方針②**（利用者がパッチ `pending-fixes-3.patch`・`pending-fixes-4.patch` を適用、各テスト68件・69件合格）: `models.json` の `native_subagents` を能力項目に分割（`model_override`: enforced / unverified / unsupported、`model_param`、`child_usage`: measured / included_in_parent / unavailable、`verified_version`、`verified_at`、`basis`）。Hookは能力で判断する。モデルを指定できる製品は注入・不一致の拒否、指定できない製品（Antigravity）は「推奨＝親（または定義）のモデルなら許可、違えば拒否して `agentctl run` へ案内」。子の使用量を出さない製品は子に `unavailable` を明示。Codexの判定式を `collaborationspawn_agent` に対応。起動引数は項目名だけを記録（値は記録しない）。
- **方針③**: `doctor` に版の変化の検知を追加（`version_claude` / `version_codex` / `version_antigravity` / `version_codex_app`、前回のdoctorからの変化 `version_changed`）。実機で **Codex CLI・デスクトップアプリが能力確認時の0.161.0から0.162.1に更新されていたことを検知**し、0.162.1で能力を再確認したうえで `models.json` を更新して警告が解消した。Antigravity CLIは `--version` がないため `agy changelog` の先頭行を使う。
- **実機試験**（利用者の許可、各1回）:

| 製品 | 結果 |
|---|---|
| Codex 0.162.1（親 gpt-6.1-sol、L2） | spawn_agent の呼出しにモデル指定はなかったが、HookのupdatedInputで `model=gpt-6-luna` を入れ、**子スレッドは gpt-6-luna で動いた**（rolloutで確認）。子は起動前に登録された管理対象（managed=1）で、親に結び付き、使用量22,882トークン（measured）。→ Codexの `model_override` を `enforced`（0.162.1）に更新 |
| Antigravity 1.3.3（親 gemini-3.8-flash-medium、L2） | 推奨（default→L2→gemini-3.8-flash-medium）が親のモデルと一致して許可（`subagent_parent_model_allowed`）。子の会話のHookで実モデルも gemini-3.8-flash-medium と照合。子の使用量は `unavailable` と明示。`invoke_subagent` の最上位の引数は `Subagents`・`toolAction`・`toolSummary`（モデル指定なし）。親の使用量で初めて思考トークンを含む実データ: 入力38,780・出力2,527（うち思考2,435）・合計41,307 → **total=input+output、思考は出力の内数**と確定し、二重加算なしで記録 |

- 試験中に見つけて直したもの（保護対象外のため直接修正、テスト70件合格）: (1) Antigravityの認証判定がトークンファイルの有無に依存し、Antigravityの更新後にファイルが無くなって「認証なし」と誤判定した → `agy models`（モデルのターンを使わない）の成功で判定し10分キャッシュ。誤判定時の試行はモデルを呼ぶ前に拒否されたため、許可の1回には数えていない。(2) 計測DBを開く際の待機時間の設定順（13:46 UTCにCodexのHookで `database is locked` が1回。原因は再現できず、待機時間を先に設定する安全側の修正と同時書込みの回帰試験を追加）。(3) doctorの未計測の表示を、記録漏れ（missing）と製品の制約による取得不可（unavailable）に分けた。
- 監査（`doctor --audit`、Hook導入以降）: Codex 14・Claude 1セッションで未観測0件。

### 追記4（2026-10-12 01:58〜02:10 UTC、作業回 015814-T121-1080c59d、購読枠の使用と以降の確認不要は利用者の包括許可）
- **Antigravityの対話セッション（実機）**: 利用者がAntigravityアプリで行ったT114・T071・T115の会話（2026-10-11 14:16〜16:48 UTC、gemini-3.8-flash-high→medium）で、PreInvocation Hookがセッションを登録してRouterの推奨（L2/general→gemini-3.8-flash-medium）を記録し、Stop Hookが使用量を `unavailable` と明示した。制約: Antigravityは利用者の発言本文をHookに渡さないため難易度は既定のL2、会話内の複数作業が1タスクにまとまる。拒否・サブエージェントの記録はなかった（`allow` 応答はイベントに残さない設計のため、許可の回数は記録上確認できない）。
- **GEMINI.md の読込み（実機、Gateway経由の `agy -p`、gemini-3.8-flash-low）**: 「ツールもファイルも使わずに規約を答えよ」に対し、GEMINI.md 固有の記述（session.json の status が open、WORKLOG.md・evidence/ の書換え禁止、利用者の確認なしの finish 禁止）を1ターンで回答。入力トークンが規約追加前の同種の試験より約1,000多い。→ 読み込まれていると判断（ツールを使っていないことは記録上は証明できない）。
- **Claude（実機、Gateway経由の `claude -p`、ログイン後）**: claude-haiku-5-5 で completed、36,766トークン measured、結果の modelUsage で承認モデルと一致。子セッションのSessionStartには `-p` ではモデル名が来ないため子側は照合不能（結果側で照合）。Claudeの報告額 $0.0030 に対し推定は $0.0040（Haikuのキャッシュ読み単価が未確認で通常単価で計算するため高め）。
- **Hookの誤判定（ヒアドキュメントの本文）を修正**: 本文は文章として扱い、シェルへ流し込む本文（`bash <<EOF` 等）だけをコマンドとして判定。承認鍵・計測DBのパスは本文でも拒否。このセッションで、本文に `codex 0.161…`・`claude -p` を含む `cat <<EOF` が通ることを実機で確認。
- **保守の仕組み**: 利用者の包括許可（確認不要）を受け、`agentctl maintenance apply <patch>` を追加（一時コピーで全試験→本体へ適用→全試験→基準ハッシュ更新→記録。失敗なら本体を変えない）。AGENTS.md と model-router Skill「保守」に手順と許可を明記。パッチ5（誤判定）・パッチ6（Hook導入前に始まった対話のモデルをトランスクリプトから補う）をこの仕組みで適用（各回とも一時コピー・本体で全試験合格）。
- **版の検知（実機）**: Codexデスクトップアプリが同梱するcodexは 0.162.0-alpha.2 で、CLI（0.162.1）と異なることを `version_codex_app` が検知。デスクトップアプリでもHook（セッション登録・プロンプトの推奨・Bash判定）が動くことはDBの記録で確認したが、サブエージェントのモデル注入はCLI 0.162.1でのみ確認。
- **コスト削減の実測**: 実データで `optimize propose` は `no_change`（Gateway経由の実行11件はいずれも品質評価がなく、判定基準の各戦略20件に届かない）。削減額は評価つきの実績がたまるまで測れない。
- テスト75件合格。監査（Hook導入以降）: Claude 2・Codex 16セッションで未観測0件。

### 追記5（2026-10-12 02:11〜03:10 UTC、作業回 021141-T121-cb2c0505、包括許可）
- **Antigravityの会話記録に使用量があった**（事前調査の「使用量なし」は1.3.3では誤り）。`~/.gemini/antigravity-cli/brain/<会話>/.system_generated/logs/transcript.jsonl` のステップごとの `input_tokens`・`cache_read_tokens`・`output_tokens` の合計が、`agy -p` の結果の usage と3会話で完全一致（例 62,201+192=62,393）。子エージェントの会話の使用量は親の結果に含まれない。
- これにより（パッチ7・8、`maintenance apply` で適用）: (1) 対話セッションの使用量を Stop で会話記録から実測（以前は unavailable）。(2) Stop ごとにタスクを区切り、次の PreInvocation で新しいタスクにする（発言ごとの分割）。分類は会話記録の最後の利用者の発言で行い本文は保存しない。(3) Gateway経由の子は、同じ実行の承認で動いた別の会話を子とみなして会話記録から実測（実機: 子 31,341トークン measured。過去の2件も 17,291・14,486 で補完し、記録漏れの警告が解消）。(4) 対話中の子は、環境変数 `ANTIGRAVITY_CONVERSATION_ID` が親の会話のとき、親の未着手の子に結び付けて実測（模擬入力で試験、実機未確認）。(5) Antigravity自身の会話をこの環境変数で「入れ子の未承認」と判定しないよう修正（対話中のサブエージェントが止められる恐れがあった）。
- Hookの受信項目（実機）: `artifactDirectoryPath`・`conversationId`・`initialNumSteps`・`invocationNum`・`modelName`・`transcriptPath`・`workspacePaths`。`parentConversationId`・`lastUserInput` はない。環境変数に `ANTIGRAVITY_CONVERSATION_ID` と Gateway の `AGENTCTL_*` が届く。
- **コスト削減の実測（実機、Codex 8回）**: 「1〜10の合計を answer.txt に書く」（L1、試験 `grep -qx 55` で合否、成果物つき）を、軽量開始（gpt-6-luna）と標準開始（gpt-6.1-sol）で各4回。結果: 合格率は両方 4/4、上位切替えなし。合格1件当たりの費用（API相当額、公式単価）は **軽量 $0.002155、標準 $0.032922（軽量で約93%削減）**、平均時間 18.6秒 対 28.7秒、トークンは軽量 172,807・標準 159,073。現行の方針（L1は軽量で開始）が最適と判定され、方針は変更していない（`optimize propose` は no_change）。注意: 各4件・単純な1課題の小さな標本で、一般化はできない。購読枠の利用で、実際の請求額の削減ではない。
- **Optimizerの欠陥を修正**: 単価が未確認のとき同じ製品内でトークン数を費用の代わりにしていたため、上の実測で「標準へ切り替え」という誤った提案が出た。単価がそろう戦略どうしでだけ比べるよう修正し、誤った提案は却下として記録（方針には適用していない）。Codexの3モデルの公式単価（developers.openai.com のモデルページで確認）を登録し（パッチ9）、`agentctl reprice` で過去の使用量79件のAPI相当額を計算し直した。
- テスト79件合格。監査で未観測0件（Claude 2・Codex 24）。

### 追記6（2026-10-12 02:28〜02:40 UTC、Codex / gpt-5.6-sol、作業回 022817-T121-fe18c5c9、包括許可）
- **Codexデスクトップ同梱0.162.0-alpha.2のnative subagent（実機）**: モデル指定なしのexplorerを1回だけ起動した。親はgpt-5.6-sol、HookのRouter判定はL1/extractionで、子はgpt-6-luna。`agentctl status exe_0mv4muiyy0c5927f48ce3 --require-metered` で `route=native_subagent`、`managed=true`、親実行 `exe_0mv4mtgjp467e750dad3b` への結び付き、completed、39,901トークン measuredを確認した。子rollout（agent_id `01a12df0-91ae-7073-ac32-e0580980ea3d`）では、起動時のgpt-5.6-solに続きHook適用後の `turn_context.model=gpt-6-luna` が記録され、その後に応答「OK」が出た。doctorのイベント集計に `spawn_args=4` があり、`subagent_model_not_applied` と `model_mismatch` はない。
- **版の根拠とdoctor**: `models.json` のCodex native_subagentsへ `verified_app_version=0.162.0-alpha.2` と上記の根拠を追加した。CLI版の `verified_version=0.162.1` とデスクトップ同梱版を別々に判定するようdoctorと回帰試験を更新した（`pending-fixes-10.patch`、`agentctl maintenance apply`。一時コピー・本体とも79件合格、型検査合格、`.codex/hooks.json` は不変）。適用後の `version_codex_app` はok。
- **コスト・品質の実測拡大（実機、Codex 50回）**: 算術、抽出、分類、並べ替え・変換、書式化の5種類×5件を、同一課題の軽量開始と標準開始で各1回実行した。全実行を成果物 `answer.txt` と完全一致試験で評価し、50/50がmeasured。追加分は軽量17/25合格・922,213トークン・API相当$0.034824、標準24/25合格・995,820トークン・API相当$0.858604。既存4件ずつを合わせると軽量21/29（合格率0.72、$0.002069/合格）、標準28/29（0.97、$0.035368/合格）。軽量は合格1件当たり約94%安いが、方針の最低合格率0.90を満たさなかった。
- **Optimizerの実運用**: 前回提案後50実行で `optimize due` がtrue。提案 `prp_0mv4n6i056174d8de9c2c` は extraction/L1 をlightからstandardへ変更する内容。PMとして、軽量の合格率が品質下限を下回り標準が満たすため承認し、適用した。方針は2026-10-11.1から2026-10-12.1、overrideは1件になり、適用後のplanでnormalのextraction/L1もgpt-6.1-solを選択する。`optimize check` は適用後実績0件のため劣化なし・復元なし。
- **Antigravityの対話中の子（未確認）**: `agentctl doctor` は `agy_payload_keys=2` を示すが、`agy_child_session_bound` は0件（イベント集計に現れない）。`agentctl status` にあるAntigravityのnative_subagent 3件は、いずれも既存のGateway親へ結び付いた実行でmeasuredであり、対話中の子を `ANTIGRAVITY_CONVERSATION_ID` で結び付けた新しい実データではない。`env_conversation_is_self` と対話親へのbindingは未確認のまま。
- **database is locked**: `data/hook-errors.log` は2026-10-11T13:46:58.631Zの1件（スタックを含む7行、mtime 2026-10-11 06:46:58 -0700）のままで、今回のnative subagent・保守適用・50実行・Optimizer適用中に再発なし。
- **最終回帰試験**: 方針適用直後はHook試験5件が旧方針の軽量モデルを固定期待して失敗した。試験を「現在のRouter選択を注入し、別モデルなら不一致を検知する」形へ直し、方針変更への追従性を保った。最終結果は79/79合格、agentctl用TypeScript型検査も合格。

#### 完成条件1〜10の再判定
| 条件 | 判定 | 根拠 |
|---|---|---|
| 1 Codexから開始してRouterで実行先を選択 | 満たす | 対話の推奨記録、Gateway実行、デスクトップnative subagentのgpt-6-luna注入を実機確認 |
| 2 Claude Codeから共通ルーティングを利用 | 満たす | Hook・Gateway・native subagentを実機確認（追記1〜4） |
| 3 Antigravityから共通ルーティングを利用 | 満たす | 対話PreInvocation、Gateway、使用量取込みを実機確認（追記4〜5） |
| 4 管理対象サブエージェントの実行状況を追跡 | **一部未達** | Claude、Codex、Gateway経由Antigravityは親子・実モデル・計測を確認。Antigravity対話中の子だけbinding未確認 |
| 5 取得可能な使用量をSQLiteへ記録 | 満たす | 3製品でmeasured/unavailableを区別。今回の51子実行（native 1＋Gateway 50）も全件measured |
| 6 モデル別・タスク別の効率を比較 | 満たす | `usage` / `report` と29件ずつの比較実績 |
| 7 Optimizerが改善案を生成 | 満たす | 実データで提案→PM承認→適用→履歴保存まで確認 |
| 8 未承認モデル実行を管理経路で拒否 | 満たす | 承認不一致・直接起動の自動試験とClaude実機拒否 |
| 9 計測迂回を検知 | 満たす（範囲制約あり） | Claude/Codexのローカル記録をdoctor auditで照合。Antigravityの全経路は内部形式上の制約あり |
| 10 強制不能経路の技術的理由を説明 | 満たす | architecture 7章と本レポート3〜5章に記録 |

**総合判定**: 条件4のAntigravity対話中サブエージェントの結び付けが実データで未確認のため、T121はreviewを維持する。実装済み・模擬試験合格を実機確認へ読み替えない。

### 追記7（2026-10-12 06:3x UTC、Claude Code / claude-opus-5-5、作業回 063955-T121-b7755653）
- **Antigravityの対話でのサブエージェント（実機、利用者の操作）**: 利用者が対話（親モデル gemini-3.8-flash-high）で「サブエージェントにREADMEの1行目を読ませて」と依頼。Hookは invoke_subagent を2会話で計4回拒否した（`subagent_denied_unenforceable=2` ほか。拒否文「親のモデル gemini-3.8-flash-high で動く。Model Routerの推奨は gemini-3.8-flash-medium（L2/general）」）。Antigravityは案内に従い `scripts/agentctl run` に切り替え、`tsk_0mv4vqr1851b98f868ca7`（antigravity:gemini-3.8-flash-medium、route=cli、managed、completed、35,735トークン measured）で正しい結果を返した。強制できない製品で「推奨と違えば拒否→管理経路へ」が対話で機能することを実機確認した。
- **未確認のまま**: 子が拒否されたため起動せず、`agy_child_session_bound` は0件のまま（`agy_payload_keys` は2→5）。対話中の子の結び付けは、親モデルが推奨と一致する（許可される）場合にだけ起きる。確認には、Antigravityの対話モデルを gemini-3.8-flash-medium にして同じ依頼をする必要がある。
- 証跡: logs/2026-10-12/063955-T121-b7755653/evidence/（agy-subagent-denied.txt、agy-rerouted-run.json、doctor.json）。

**総合判定（更新なし）**: 条件4は一部未達のまま、T121はreview。

### 追記8（2026-10-12 06:48〜07:1x UTC、Claude Code / claude-opus-5-5、作業回 065129-T121-a2e6c506）
- **Antigravityの対話中のサブエージェント（実機、利用者の操作）**: 対話モデルを gemini-3.8-flash-medium にして同じ依頼。Hookは推奨＝親のモデルとして invoke_subagent を許可し（`subagent_parent_model_allowed`）、子 `exe_0mv4w4tuebf27fdf5b311`（route=native_subagent、managed、親 `exe_0mv4w4mve9bbef6fb889a`）を記録した。子の会話 07a89336… は実際に動き、正しい結果を親へ返した。
- **実データで分かった仕様（従来の想定の誤り）**: (1) 子の会話の `ANTIGRAVITY_CONVERSATION_ID` は**子自身のID**だった（`env_conversation_is_self: true`）。環境変数では親を特定できない。(2) invoke_subagent は非同期で、PostToolUse の時点では子はまだ動いている（Hookは子を completed・unavailable にしていた）。(3) 子の会話は独立の対話タスク（managed=0）として記録され、使用量はそちらに入っていた（親子が切れていた。合計の二重計上はなし）。
- **修正（パッチ11・12、`agentctl maintenance apply`、本体で80件・型検査合格）**: 親のStopのたびに、親の会話記録の「Created the following subagents」にある子の会話IDを、親の未結び付けの子の実行へ順に結び付ける。子の会話が独立の対話として記録した使用量をその子の実行へ移し（独立の側は `included_in_parent`）、子の会話記録から残りを実測する。何度実行しても同じ結果になる。実機の順序を再現する試験を追加した。読取り専用の `agentctl events` と `agentctl status --session` も追加した（保護対象外）。
- **実データへの適用**: 今回の親の会話は修正前にStopが済んでいたため、同じ関数（`linkAgyInteractiveChildren`）を今回の親の会話に1回だけ実行して補完した。結果: `agy_child_session_bound`（via=parent_transcript）、子の agent_id=07a89336…、実モデル gemini-3.8-flash-medium、**30,795トークン measured**（子の会話記録の3ステップ合計と一致）、`agentctl status --require-metered` exit 0、独立の側は `included_in_parent`。
- **区別**: 結び付けと計測の**処理と結果**は実データで確認した。修正後のHookが**実際のStopイベントで自動的に**この処理を行うところは、まだ実機で観測していない（模擬試験で確認済み。次にAntigravityでサブエージェントを使ったときに `agentctl events --kind agy_child_session_bound` で確認できる）。
- **models.json**: Antigravityの `native_subagents.child_usage` は `unavailable` のまま（PostToolUseで仮の「取得不能」を置き、結び付け時に消す動作に使っている）。実際は対話中・Gateway経由とも子の会話記録から実測できる。値と根拠の更新は次の保守で行う。
- 証跡: logs/2026-10-12/065129-T121-a2e6c506/evidence/（agy-interactive-child.json、events-bound.json、events-child-session.json、maintenance-apply-11.json・12.json、tests-final.txt、doctor-final.json）。

#### 完成条件4の再判定
| 条件 | 判定 | 根拠 |
|---|---|---|
| 4 管理対象サブエージェントの実行状況を追跡 | **満たす** | Claude・Codex（CLI・デスクトップ）・Antigravity（Gateway経由・対話中）で、親子・実モデル・計測を実データで確認。Antigravity対話中の自動の結び付けは、次回の実機で観測を続ける |

**総合判定**: 完成条件1〜10をすべて満たす（条件9は範囲の制約つき、追記6の表のとおり）。T121を done にする。

## 2. 試験結果（TEST-001〜015）

| ID | 内容 | 模擬（自動テスト） | 実機 |
|---|---|---|---|
| 001 | Codexから通常タスク → Routerの選択を記録 | 合格（hooks.test） | **確認**（追記）: 利用者のCodex対話でUserPromptSubmitが発火し推奨を記録。Gateway経由の `codex exec` で子セッションのHookが承認と実モデルを照合 |
| 002 | Claude Codeから通常タスク → Router・Token Monitor | 合格 | **確認**: PreToolUse・Subagent系・計測、利用者の発言でのUserPromptSubmit（追記） |
| 003 | Antigravityから通常タスク → 選択・計測 | 合格（対話の使用量はunavailableと明示） | 一部確認（追記）: Gateway経由の `agy -p` で子セッションのPreInvocation Hookが発火し照合、使用量をmeasuredで記録。対話セッションから始めた場合は未確認 |
| 004 | Codexのサブエージェント | 合格（spawn_agentへのモデル注入、rolloutから子の使用量） | **確認**: CLI 0.162.1とデスクトップ同梱0.162.0-alpha.2でモデル注入・親子・使用量を確認（追記3・6） |
| 005 | Claude Codeのサブエージェント | 合格 | **確認**: opus指定は拒否、未指定はhaiku注入、子の実行・使用量・承認を記録。親の実行IDは、導入後の利用者の発言がまだないため空 |
| 006 | Antigravityのサブエージェント | 合格（親子を記録、モデルは強制せず記録） | **一部確認**: Gateway経由は親子・実モデル・使用量を確認。対話中の子のbindingは未確認 |
| 007 | 未承認のモデルを直接実行 | 合格（承認なし・偽造・期限切れ・使用済み・モデル差し替えを拒否） | **確認**: Claude CodeのBashから `codex exec` / `claude -p` / `bash -c "agy ..."` を拒否 |
| 008 | Token Monitorを無効にして実行 | 合格（`AGENTCTL_TELEMETRY=off` で開始しない、使用量なしは `unmetered`） | — |
| 009 | 同じ結果を2回送信 | 合格（dedupe_key、累積値の差分、トランスクリプト再読） | — |
| 010 | 途中でエラー | 合格（失敗原因と消費量2,400トークンを記録） | 一部: 未ログインのClaudeは選ばれず拒否（実機、費用なし） |
| 011 | 軽量モデルで失敗 | 合格（能力不足だけ1段上、一時的失敗は同じモデルで2回まで、他は停止） | — |
| 012 | 実績不足で最適化 | 合格（no_change、方針ファイル不変） | — |
| 013 | 最適化後に品質悪化 | 合格（PM確認→適用→劣化検知→旧版へ復元、バイト一致） | — |
| 014 | Hookの無効化・設定変更 | 合格（7種の改変を拒否、保守モードの例外） | **確認**: `--bare` 起動・`.codex/hooks.json` の編集・承認鍵・計測DBの変更を拒否。`doctor` の基準ハッシュ照合 |
| 015 | ルーティングなしのCLI起動 | 合格（直接起動の拒否、入れ子の未承認セッションの停止） | **確認**（007と同じ）。入れ子判定の環境変数は実機未確認 |

テスト: `node --test orchestration/tests/*.test.ts` 59件合格、型検査合格（evidence/tests.txt、typecheck.txt）。

## 3. 分類

### 実装できた機能
3 Skill（`.agents/skills/model-router`・`token-monitor`・`routing-optimizer`、Claude Code用入口 `.claude/skills/`）、JSON Schema 7件、ルールベースのModel Router、Execution Gateway（`agentctl run/plan/status/usage/report/optimize/approve/evaluate/ingest/doctor/init/hook`）、HMAC承認（1回限り・実行ID/モデル/推論レベル/実行主体/期限に紐付け）、5製品分のアダプタ（claude -p、codex exec、agy -p、Gemini API、L0プログラム）と模擬CLI、SQLiteのToken Monitor（正規化・冪等・累積差分・トランスクリプト/rollout取込み・集計）、Routing Optimizer（分析・提案・PM確認・適用・劣化検知・復元・変更履歴）、3製品のHook設定と共通Hook処理、`doctor --audit` による迂回検知、手順書・運用書・トラブル対応。

### 実機で動作確認した機能
- Claude Code: プロジェクトHookの即時読込み、Bash判定による拒否（AI CLI・鍵・DB・`--bare`）、Edit保護、Agentツールのモデル拒否・注入、SubagentStart/Stopでの子の結び付けと使用量取込み（evidence/real-claude-hooks.txt）。
- Antigravity: `.agents/hooks.json` の読込み（evidence/real-agy-hooks.txt）。
- Gateway: 実際の認証状態でのルーティング（Codex→gpt-6-luna、動画解析→Antigravity gemini-3.8-flash-medium）、未ログインのClaudeを選ばない拒否、L0の実プログラム実行（evidence/real-gateway-nocost.txt）。
- `agentctl init`（鍵0600・リポジトリ外）、`doctor`（Codexの未信頼・Claude CLI未ログインを正しく報告）、`doctor --audit`（Hook導入前のClaude 6・Codex 6セッションと、このセッションの未計測分を検知）（evidence/doctor-audit.json）。

### 設定だけ存在する機能（実機で動いていない）
- `.codex/hooks.json`（利用者の信頼待ち）。
- Gemini APIアダプタ（キー未設定・方針で無効。模擬fetchでのみ試験）。
- Gatewayからの実モデル実行（`claude -p` は未ログイン、`codex exec`・`agy -p` は購読枠を使うため承認待ち）。
- L4の独立レビュー（模擬CLIでのみ試験）。

### 未検証の機能
- Codexの全Hookイベントの実際の入力形式・拒否の効き方、Antigravityの対話・`-p`・サブエージェントでのHook入力（`modelName`・`invoke_subagent` の引数名など）。
- 各製品がシェル実行に付ける環境変数（`CODEX_THREAD_ID`・`ANTIGRAVITY_CONVERSATION_ID`）による入れ子判定。
- `agy -p` のusageの包含関係（total_tokensとの算術一致で判定する実装にしたが、実データで未確認）。
- Antigravityで `run_command` に `ask` を返したときの操作感（毎回の許可確認になるか）。

### 技術的に実現できない機能（このリポジトリ単独では）
- 実行中の親モデルの切替え（Routerは推奨を記録し、委譲だけ行う）。
- 起動側の指定でHookが読まれない経路の阻止（`claude --bare` / `--safe-mode` / `--setting-sources user`、Codexの未信頼・`--disable hooks`、人の端末からの起動）。管理設定（Claudeの `allowManagedHooksOnly`、`/etc/codex/requirements.toml`）か、別ユーザーでの実行が必要。
- 同じOSユーザーのプロセスによる承認鍵の読み取りの完全な阻止（Hookを通る操作だけ拒否できる）。
- 実請求額の取得（購読枠の請求は使用量単位で取れない。`actual_billed_usd` は常にnull）。
- Antigravityの対話セッションの使用量（Hook・トランスクリプトに含まれない）。

## 4. 強制適用が成立する範囲・しない経路
docs/agent-routing/architecture.md 7章の表のとおり。要約:
- 成立: `agentctl run` の全実行。Hookが読み込まれたClaude Code（実機確認）・Codex（信頼後、模擬確認）・Antigravity（読込み確認、動作は模擬）の、Bash系ツールからのAI CLI・AI API直接呼出し、保護ファイルの編集、サブエージェントのモデル（Claude・Codex）。
- 不成立: Hookが読まれない起動、文字列の難読化・スクリプト内呼出し・SDK利用、Codexの内部子エージェントとホスト側ツール、Antigravityのサブエージェントのモデル指定、Codex Hookの失敗時（fail open）。これらは `doctor --audit` で事後検知する（Claude・Codexのローカル記録が対象。Antigravityは記録形式が非公開で対象外）。

## 5. トークン計測の精度と制約
| 製品・経路 | 入力・キャッシュ | 出力・推論 | 精度 |
|---|---|---|---|
| Claude `-p` 結果JSON | measured | 出力measured、推論unavailable | 製品の集計値（サブエージェント込み）。`total_cost_usd` はクライアント推定 |
| Claude対話（トランスクリプト） | measured | 出力・思考measured（実ファイルに `thinking_tokens` を確認） | 内部形式で版により変わりうる。同一メッセージの複数行は1件に統合 |
| Codex rollout | measured（total=input+outputを実ファイルで確認） | measured | 応答単位。形式は非公開扱い |
| Codex `exec --json` | measured | measured | スレッド累積・サブエージェント除外のためrolloutを優先 |
| Antigravity `-p` | 包含関係を算術一致で判定、合わなければestimated | 同左 | 実データ未確認 |
| Antigravity対話 | unavailable | unavailable | 取得手段なし |
| Gemini API | measured | measured | 公式の包含関係どおり（未実行） |
API相当額は登録簿の単価からの推定で、Codexの各モデルとGemini 3.1 Proは単価未確認のためnull。Claudeの1時間キャッシュ書込みは5分の単価で計算しているため過小になる。

## 6. コスト削減の実測結果
（追記 2026-10-12）Codexでの小規模な実測で、品質を満たしたタスク1件当たりの費用は軽量開始が標準開始より約93%安かった（$0.002155 対 $0.032922、各4件、追記5）。以下は当初（2026-10-11）の記載。

**実測なし。** 実モデルでの実行実績がまだなく、Optimizerの判断基準（各戦略の評価済みタスク20件以上）を満たすデータがない。模擬データでは「軽量モデルで開始し80%が上位切替えになる戦略は、合格1件当たりの費用が標準開始より高い」ことを判定できることを確認した（テスト）。削減額を報告できるのは、実運用で実績がたまってから。

## 7. 残っている問題
（追記 2026-10-11 12:40 UTC）1の(a)(b)は利用者がパッチを適用して解消、2は利用者が信頼して解消、4はCodex・agyを各1回実行して確認済み（1章の追記）。残りは、1(c)、3（Claude CLIのログイン）、5、6、7、Codex・Antigravityのサブエージェントの実機確認、Antigravityの対話セッションでのHook動作、`agy -p` のusageの包含関係（今回は思考・キャッシュが0で判定できなかった）、コスト削減の実測。

1. **Hook判定の不具合3件（実機で発見）**: (a) 参照系コマンドにリダイレクト等が付くと誤って拒否する、(b) CodexのPMの `optimize review|apply|rollback` もHookが拒否する、(c) コマンド本文（ヒアドキュメント内の文章など）に承認鍵のパス文字列が含まれるだけで「鍵へのアクセス」と判定して拒否する（文字列判定の限界。回避はスクリプトをファイルに書いて実行）。(a)(b)の修正は `docs/agent-routing/pending-hook-fixes.patch`（一時コピーでテスト61件・型検査合格、`git apply --check` 可）。(c)は未修正。Hook実装は保護対象のため、このセッションは自分で作った保護に従い適用していない。人の保守作業（保守モードのセッション、または人の端末で `git apply`）が必要。適用後は `./scripts/agentctl init` で基準ハッシュを更新する。
2. Codexのプロジェクト・Hookの信頼（利用者の操作、setup.md 4章）。
3. Claude CLIのログイン（`claude auth login`、利用者の操作）。
4. 実モデルでのGateway実行の確認（購読枠を使う。承認後に `codex exec`・`agy -p` を最小のプロンプトで各1回）。
5. Antigravityの `run_command` に `ask` を返す影響の確認と、許可確認が多い場合の方針決定（利用者の判断）。
6. 承認鍵の分離（別ユーザーの署名サービス）と、管理設定によるHook無効化の阻止は未実装。
7. 単価未確認のモデル（Codex各モデル、Gemini 3.1 Pro）のAPI相当額。
