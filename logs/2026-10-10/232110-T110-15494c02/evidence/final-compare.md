# 比較結果: 合格

- 参考: /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/reference/reference.mp4
- 生成: /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/render/reproduction.mp4
- 形式: 1280x720 30fps 300フレーム

## 画素
- SSIM 平均 0.99939 / 最小 0.99889（フレーム221） 基準: 平均≥0.98、最小≥0.95
- PSNR 平均 48.41dB / 最小 44.49dB 基準: 平均≥35dB
- シーン0: SSIM 平均 0.99927 / 最小 0.99905
- シーン1: SSIM 平均 0.99952 / 最小 0.99889

| 差の大きいフレーム | SSIM | PSNR | 差>16の画素 | 範囲 (x0,y0)-(x1,y1) |
|---|---|---|---|---|
| 221 | 0.99889 | 44.49 | 373 | (569,130)-(1071,547) |
| 113 | 0.99905 | 48.24 | 954 | (160,194)-(989,381) |
| 117 | 0.99905 | 48.24 | 953 | (160,194)-(989,381) |
| 121 | 0.99905 | 48.24 | 953 | (160,194)-(989,381) |
| 125 | 0.99905 | 48.24 | 953 | (160,194)-(989,381) |

## 動き（生成動画を同じ解析器で測定）
| 参考 | 生成 | 最大誤差 | 動き（開始差/終了差フレーム、イージング） | 判定 |
|---|---|---|---|---|
| s0-e0 | s0-e0 | cx:0.186 cy:0.058 w:0.591 h:0.522 angle:0 opacity:0.001 | translate: ?/0.01（開始は識別不能のため判定外。見え始めの差0） easeOutCubic→easeOutCubic | 合格 |
| s0-e1 | s0-e1 | cx:0.019 cy:0.047 w:0.31 h:0.363 angle:0 opacity:0.001 | scale: 0/0.01（モデル時刻。見え始めの差0） easeOutBack→easeOutBack | 合格 |
| s0-e2 | s0-e2 | cx:0.075 cy:0.01 w:0.151 h:0.032 angle:0 opacity:0 | grow: 0/0（モデル時刻。見え始めの差0） linear→linear | 合格 |
| s1-e0 | s1-e0 | cx:0.107 cy:0.037 w:0.169 h:0.192 angle:0.012 opacity:0.002 | rotate: 0/0 easeInOutQuad→easeInOutQuad | 合格 |
| s1-e1 | s1-e1 | cx:0.134 cy:0.115 w:0.623 h:0.567 angle:0 opacity:0.002 | translate: -0.01/0.01 easeInOutCubic→easeInOutCubic | 合格 |
| s1-e2 | s1-e2 | cx:0.003 cy:0.025 w:0.006 h:0.03 angle:0 opacity:0.008 | fade-in: 0/-0.03（モデル時刻。見え始めの差0） easeInOutSine→easeInOutSine | 合格 |

## 不合格の理由
- なし

## 比較画像
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare/cmp-f0040.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare/cmp-f0096.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare/cmp-f0113.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare/cmp-f0117.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare/cmp-f0189.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare/cmp-f0221.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare/cmp-f0232.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare/cmp-f0268.png
- 比較動画: /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/final/compare/side-by-side.mp4
