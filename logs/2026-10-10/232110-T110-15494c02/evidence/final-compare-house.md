# 比較結果: 合格

見た目（配色・角丸）を意図的に変えた再現。画素・形・大きさ・見え始めは判定に含めず、位置・角度・不透明度・時刻・イージングで判定した。

- 参考: /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/reference/reference.mp4
- 生成: /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/render/reproduction-house.mp4
- 形式: 1280x720 30fps 300フレーム

## 画素
- SSIM 平均 0.97194 / 最小 0.95352（フレーム117） 基準: 平均≥0.98、最小≥0.95
- PSNR 平均 25.33dB / 最小 23.22dB 基準: 平均≥35dB
- シーン0: SSIM 平均 0.95856 / 最小 0.95352
- シーン1: SSIM 平均 0.98531 / 最小 0.97844

| 差の大きいフレーム | SSIM | PSNR | 差>16の画素 | 範囲 (x0,y0)-(x1,y1) |
|---|---|---|---|---|
| 117 | 0.95352 | 23.22 | 919529 | (0,0)-(1279,719) |
| 125 | 0.95352 | 23.22 | 919529 | (0,0)-(1279,719) |
| 129 | 0.95352 | 23.22 | 919529 | (0,0)-(1279,719) |
| 133 | 0.95352 | 23.22 | 919529 | (0,0)-(1279,719) |
| 137 | 0.95352 | 23.22 | 919529 | (0,0)-(1279,719) |

## 動き（生成動画を同じ解析器で測定）
| 参考 | 生成 | 最大誤差 | 動き（開始差/終了差フレーム、イージング） | 判定 |
|---|---|---|---|---|
| s0-e0 | s0-e0 | cx:0.173 cy:0.079 angle:0 opacity:0.001 | translate: ?/0（開始は識別不能のため判定外。見え始めの差0） easeOutCubic→easeOutCubic | 合格 |
| s0-e1 | s0-e1 | cx:0.015 cy:0.017 w:0.276 h:0.234 angle:0 opacity:0.003 | scale: 0/0.01（モデル時刻。見え始めの差0） easeOutBack→easeOutBack | 合格 |
| s0-e2 | s0-e2 | cx:0.154 cy:0.033 angle:0 opacity:0 | grow: 0/0（モデル時刻。見え始めの差0） linear→linear | 合格 |
| s1-e0 | s1-e0 | cx:0.123 cy:0.055 angle:0.024 opacity:0.01 | rotate: 0/0 easeInOutQuad→easeInOutQuad | 合格 |
| s1-e1 | s1-e1 | cx:0.167 cy:0.092 angle:0 opacity:0.002 | translate: 0/0 easeInOutCubic→easeInOutCubic | 合格 |
| s1-e2 | s1-e2 | cx:0.035 cy:0.152 angle:0 opacity:0.013 | fade-in: 0.1/-0.01（モデル時刻。見え始めの差2） easeInOutSine→easeInOutSine | 合格 |

## 不合格の理由
- なし

## 比較画像
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare-house/cmp-f0040.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare-house/cmp-f0096.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare-house/cmp-f0117.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare-house/cmp-f0125.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare-house/cmp-f0129.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare-house/cmp-f0189.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare-house/cmp-f0232.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare-house/cmp-f0268.png
- 比較動画: /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare-house/side-by-side.mp4
