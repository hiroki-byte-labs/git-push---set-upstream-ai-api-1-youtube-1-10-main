# 作業記録 T079
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: session.json の createdAt（UTC）
- 記録種別: 同時記録

## 依頼・許可範囲
13件の実施依頼のうちT079（段階表示のフェード、最新要素の強調、場面転換）。ローカル作業のみ

## 実施内容・変更ファイル
- src/plan.ts: Style型とPlan.style?.transitions（真偽値）の検証を追加した。
- src/timeline.ts
  - Segmentにfade（最新の段の不透明度）とhighlightを追加し、RenderFrameにも渡す。
  - 定数: FADE_STEPS=[1/3, 2/3]、FADE_FRAMES_EACH=2、HIGHLIGHT_FRAMES=24。
  - 各段の出現時点から+2、+4、+24フレームに境目を加える。次の段の出現で打ち切る。
  - 完成状態（fade=1、強調なし）は従来のファイル名、途中は`-f<n>[-h]`の名前にする。
  - transitions=falseなら従来の区間になる。
- scripts/render.swift
  - RenderFrameのfadeとhighlightをデコードする。
  - newest(isNewest, box, draw): 最新の段をcgContextのsetAlphaで半透明に描き、強調中ならアクセント色の3pxの縁を描く。
  - 対象: drawFlow（各箱と、それに向かう矢印）、drawCompare（各列と⇔）、drawNumber（全体）、drawBranch（問いと答え）。
  - 空の矩形には縁を描かないよう修正した（実行前のコードレビューで発見）。
  - サムネイルでは、フェードと強調を無効にする。
- tests/timeline.test.ts（+2）、tests/plan.test.ts（+1）。
- docs/PRODUCTION-GUIDELINES.md（実装値を追記）、tickets/T079.md（done）、docs/STATUS.md。

## 判断と理由
- 根拠: E13（信号化 g=0.53）、E2（視聴ピークの61%は画面の切り替えと同時）、E4（描きながら説明すると有効）。
  - 実装: 「出現した段を縁取りで1秒強調する」「短いフェードで切り替えを知覚させる」。
  - 演出の指針（T085）に従い、常時動く装飾は入れず、合図として短くした（フェード約0.17秒）。
- 完成状態の画像を従来と同一に保った。v1の互換（不変条件1）と、確認用のscene-N.pngの意味を変えないため。
- 動的描画（線を引くアニメーション）は今回実装しなかった。描画の中間状態を多数作る必要があり、PSNRの照合設計も変わるため。段階表示とフェードで代え、チケットに明記した。
- 証跡画像の作成で、存在しないファイル（s5-st2-c1.png）を指定して1回失敗した。場面5は段の間隔が0.8秒で強調の1秒より短く、強調なしの区間が生じないためで、仕様どおり。完成状態の画像で作り直した。
- Skill化の評価: 見送る（新しい定型手順なし）。

## 検証コマンド・結果・証跡
証跡はevidence/に保存した。
- `--test` → 107件成功。`tsc --noEmit` → エラー0。`swiftc -typecheck` → 成功。
- `sample --plan fixtures/sample-v2.json` → bias-check-demo-25dad3cd。57区間（fade<1が30、強調中が45）、1152/1152フレーム、PSNRは57区間すべて照合して最小38.8dB。
- 目視（fade-highlight.png）: 場面5の2段目が、不透明度1/3（縁取りあり）→2/3→1（縁取りあり）と変わり、完成状態（4段、縁取りなし）になることを確認した。
- `sample --subtitles burn`（v1） → reflection-demo-6e9f598e。scene-1〜6がM1と一致した。864/864フレーム、PSNR 60区間すべて合格。

## 未実施・制約
- 線を引く動的描画、ズーム、ポインター（矢印カーソル）は未実装。
- フェードは段の出現だけで、場面全体のクロスフェードはない。
- 段の間隔が短い場面では、強調が次の段の出現で打ち切られる。

## TODO・再開方法
- 次はT091（1080p、最小文字サイズ、コントラストの検査）。
- 再開時の手順: NODE_BINを指定 → `./scripts/verify` → `worklog start T091`。
