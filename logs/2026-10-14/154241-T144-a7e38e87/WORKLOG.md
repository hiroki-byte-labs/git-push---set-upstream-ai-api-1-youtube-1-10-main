# 作業記録 T144
- 記録者・実施者: Codex
- モデル: gpt-6-luna (runtime)
- 開始日時: 2026-10-14T15:42:41.678Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T106で本人が選んだ枠なし字幕を、nativeとRemotionの焼き込み字幕へ反映し、隔離した短尺MP4で読めることと字幕・図解・フッターの非重複を検証する。既存出力を変更せず、外部API・課金・投稿は行わない。

## 実施内容・変更ファイル
- scripts/render.swift: native焼き込み字幕のパネルを削除。白字に黒の控えめな影（alpha 0.65、blur 6、offset 2）を追加。配置区画は保持。
- motion-lab/src/primitives/BurnInSubtitle.tsx: Remotionは元から枠なし。影を黒の6pxへ統一。
- docs/PRODUCTION-GUIDELINES.md、docs/SPEC.md: 本人希望に基づく枠なし字幕の扱いを記録。
- tickets/T144.mdを結果付きdoneへ更新し、docs/STATUS.mdに追補。
- 隔離生成先 `/private/tmp/T144-subtitle-t2lNDg`。動画本体はGit/作業ログへコピーせず、媒体JSON、AVPlayer JSON、実デコードの代表PNGを証跡に保存。

## 判断と理由
- T106回答に沿って背景パネルを取り除いた。可読性を補う影だけ残し、字幕の専用区画を維持して図解・フッターとの衝突を防ぐ。
- Remotionではパネルなしが実装済みだったため、色・太さ・影の見た目だけ合わせた。
- 演出チェック: 字幕を読みやすくするが内容とは無関係な要素は追加しない。音なし。図解/フッターを覆わない。新規外部素材なし。合成音は既存の確認音だけ。煽りなし。
- 定型作業評価: repository-task-closeout / sample-render-verification / routine-to-skillを本作業に適用。隔離生成と再生は既存sample-render-verificationに手順あり、今回繰返しはあるが独立手順の更新根拠まではないため新Skillは作らない。候補なしとして記録。

## 検証コマンド・結果・証跡
- `./scripts/run --test tests/presentation.test.ts`: 9 tests passed。
- `./scripts/run node_modules/typescript/bin/tsc --noEmit`: exit 0。
- `./scripts/run node_modules/typescript/bin/tsc -p motion-lab/tsconfig.json`: exit 0。
- 隔離native生成: 68 sec、1632 frames、1280x720/24fps、H.264/AAC。`media-check.json` fullDecode=passed、subtitle=burn、PSNR min 39.836dB。組込み媒体検査に加え独立FFmpegの動画/音声デコード exit 0。
- AVPlayer: readyToPlay、duration 68 sec、rate8、167 progress samples、ended=true、exit 0。
- PNGの5/34/63秒を目視。枠なし字幕が下部の独立区画に表示。証跡はevidence/representatives.pngとmid-frame.png。
- 試作出力は隔離コピーのみ。Remotion MP4実レンダーとChrome UI/再生はT139記載の環境制限で未検証。Remotion TS型検査は成功。

## 未実施・制約
- Chrome Headless ShellのRemotion動画出力とブラウザー字幕表示は未確認。AVPlayerはnative経路だけ。コンポーネントコードにパネルがないことと型検査は確認済み。
- 音声は自作確認音であり、ナレーションの声質・字幕同期を人が評価したものではない。
- 初回AVPlayer起動時、作業ディレクトリを間違え相対MP4パスで終了2。evidence/avplayer-cwd-mismatch.txtに記録。絶対パスで再試行し再生完了を確認。
- 外部API/課金/契約/認証/投稿なし。

## TODO・再開方法
- T144の枠なし字幕実装は受け入れ条件を満たした。続いてT145を開始し、説明対象を描く自作の抽象イラストをnative/Remotionへ追加する。
- 次の試作を本人へ見せ、絵柄/場面の方向が近いかをreviewで確認する。
