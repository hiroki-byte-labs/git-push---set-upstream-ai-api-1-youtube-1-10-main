# T150後に残る動画品質の開発課題

- 調査日: 2026-10-16 JST
- 範囲: 仕様、Plan/native/Remotion実装、T139/T145/T150の既存証跡、未完了チケットを照合。外部アクセス、試験、レンダーはなし。
- 分析補助: Model Routerで選定したCodex `gpt-6.1-sol`（subscription）。実装/チケット変更を禁止したread-only監査の結果をCodexが確認。
- 注意: この監査はコード上の欠落と未検証範囲を整理したもので、すべての生成物に目立つ崩れがあると実視聴で確認したものではない。

## 新規チケット

| Ticket | 追跡する課題 | 確認根拠 | 優先度・依存 |
|---|---|---|---|
| [T152](../tickets/T152.md) | Remotionの通常図解が項目/数値を欠落させ、meterの符号・集計もnativeと異なる | `motion-lab/src/PlanVideo.tsx` と `scripts/render.swift` の描画分岐 | P1、T106/T126完了後ready |
| [T153](../tickets/T153.md) | RemotionがPlanの出典・架空例・本人考察・demo区分を描画へ渡さない | `motion-lab/src/remotion-plan.ts`, `PlanVideo.tsx`; native footerとの比較 | P1、T152後 |
| [T154](../tickets/T154.md) | Remotionの字幕モード、cue累積時刻、reveal、transition設定がPlanと一致しない | `src/remotion-visual.ts`, `motion-lab/src/remotion-plan.ts`, `PlanVideo.tsx` | P1、T153後 |
| [T155](../tickets/T155.md) | Remotionのレイアウト報告が固定値で、実DOM・全cueのfitを測っていない | `src/remotion-visual.ts`, `src/layout.ts`, `src/readability.ts` | P1、T153/T154後 |
| [T156](../tickets/T156.md) | Remotionのmedia reportが期待frame数と固定のfullDecode成功を記録する | `src/remotion-visual.ts`, `src/commands/sample.ts`; native `src/media.ts`との比較 | P1、T126/T139完了後ready |
| [T157](../tickets/T157.md) | 10〜20分動画における視覚的な保持・反復・章ごとのリズム評価が定型化されていない | T139は技術再生検査、T150は短尺rate 8再生。`src/timeline.ts`, `src/lint.ts` | P2、T150/T152〜T156後 |

T152〜T155は同じRemotion場面コンポーネントを触るため、衝突を減らすよう順序依存を付けた。T156は媒体検査層の独立修正として並行可能。T157は統合後の評価を担い、一律のカット頻度や退屈さ判定を設けない。

## 既存チケットとの重複整理

- T027/T028/T077/T040が音声接続、長尺生成、話速/間、音声辞書・同期をすでに持つ。自然な声、実API、実音声同期のチケットを重ねて作らなかった。
- T072/T104/T124がsource metadata・人の考察・事実確認を扱う。T153はRemotionでの画面表示欠落だけに限定。
- T139は10分native MP4の独立decode・字幕境界・AVPlayer再生を実施済み。長尺生成の再実装ではなく、T157は視覚リズムの記録・解析に限定。
- T145/T150は演出方向の本人レビュー待ち。これを代理承認せず、新しい場面型を増やす依頼も重複起票しなかった。
- T031/T032/T050/T147/T148の投稿や方針判断、T130〜T137の公開データ分析は動画レンダリング品質から切り分けた。

## 信頼の境界

- T150は2題材の短尺をnative/Remotion各経路で検証し、本人レビュー待ち。記録のAVPlayer速度は8倍であり、長尺の通常速度での編集リズム評価とは異なる。
- T139はnativeの10分動画を技術的に検査したが、Remotionの同等長尺と通常速度での全編視覚評価は受け入れ証跡にない。
- T152〜T156は実装の出力忠実性・検査の正しさを補う。T157が、長尺完成品の時刻付き評価を別に担う。
- 既存テストは追加実行していない。コード読取だけで確認した欠落・未検証範囲を起票した。
