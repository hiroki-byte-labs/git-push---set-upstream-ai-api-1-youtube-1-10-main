# ルーティング改善レポート prp_0mv4mnpx33c146d17e6d1

- 作成: 2026-10-12T02:23:05.463Z / 基準方針: 2026-10-11.1
- 状態: no_change（判定に必要な評価済みタスク数: 各戦略 4 件以上）
- 費用はAPI相当額の推定（購読枠の実請求額ではない）。合格は最終実行の評価がすべて合格のもの。未評価は合格に数えない。

## 戦略別の実績（最初に選ばれたモデル単位）

| 種別 | 難易度 | 開始モデル | タスク | 評価済 | 合格率 | 再試行率 | 上位切替率 | 総トークン | 費用/タスク | 費用/合格 | 平均時間ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| extraction | L1 | antigravity:gemini-3.8-flash-low (light) | 1 | 0 | - | 0.00 | 0.00 | 16112 | 0.012276 | - | 14057 |
| extraction | L1 | codex:gpt-6-luna (light) | 4 | 4 | 1.00 | 0.00 | 0.00 | 172807 | 0.002155 | 0.002155 | 18575 |
| extraction | L1 | codex:gpt-6.1-sol (standard) | 4 | 4 | 1.00 | 0.00 | 0.00 | 159073 | 0.032922 | 0.032922 | 28743 |
| general | L2 | antigravity:gemini-3.8-flash-medium (standard) | 2 | 0 | - | 0.00 | 0.00 | 77871 | 0.034293 | - | 33754 |
| implementation | L2 | codex:gpt-6.1-sol (standard) | 1 | 0 | - | 0.00 | 0.00 | 59164 | 0.045084 | - | 20111 |
| summarization | L1 | codex:gpt-6-luna (light) | 4 | 0 | - | 0.00 | 0.00 | 132597 | - | - | 10635 |
| summarization | L1 | antigravity:gemini-3.8-flash-low (light) | 2 | 0 | - | 0.00 | 0.00 | 77422 | 0.029323 | - | 18211 |
| summarization | L1 | claude:claude-haiku-5-5 (light) | 1 | 0 | - | 0.00 | 0.00 | 36766 | 0.004029 | - | 7715 |

## 改善案

- なし（変更しない）

## 実績不足（提案の対象外）

- extraction/L1 antigravity:gemini-3.8-flash-low: 評価済み 0 件
- general/L2 antigravity:gemini-3.8-flash-medium: 評価済み 0 件
- implementation/L2 codex:gpt-6.1-sol: 評価済み 0 件
- summarization/L1 codex:gpt-6-luna: 評価済み 0 件
- summarization/L1 antigravity:gemini-3.8-flash-low: 評価済み 0 件
- summarization/L1 claude:claude-haiku-5-5: 評価済み 0 件

## 補足

- なし

適用には PM（Codex project-orchestrator）または人の確認が必要: `agentctl optimize review <id> --decision approve --reviewer <名前>` → `agentctl optimize apply <id>`。
