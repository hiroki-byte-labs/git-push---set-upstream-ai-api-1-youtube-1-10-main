# 比較結果: 不合格

- 参考: /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/dev/reference/reference.mp4
- 生成: /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/dev/render/reproduction.mp4
- 形式: 1280x720 30fps 300フレーム

## 画素
- SSIM 平均 0.99938 / 最小 0.99864（フレーム77） 基準: 平均≥0.98、最小≥0.95
- PSNR 平均 48.24dB / 最小 38.85dB 基準: 平均≥35dB
- シーン0: SSIM 平均 0.99923 / 最小 0.99864
- シーン1: SSIM 平均 0.99952 / 最小 0.99913

| 差の大きいフレーム | SSIM | PSNR | 差>16の画素 | 範囲 (x0,y0)-(x1,y1) |
|---|---|---|---|---|
| 77 | 0.99864 | 38.86 | 1373 | (161,194)-(990,543) |
| 75 | 0.99865 | 38.89 | 1377 | (161,194)-(990,543) |
| 76 | 0.99865 | 38.86 | 1357 | (161,194)-(990,543) |
| 74 | 0.99867 | 38.89 | 1378 | (161,194)-(990,543) |
| 78 | 0.99872 | 38.85 | 1353 | (161,194)-(990,543) |

## 動き（生成動画を同じ解析器で測定）
| 参考 | 生成 | 最大誤差 | 動き（開始差/終了差フレーム、イージング） | 判定 |
|---|---|---|---|---|
| s0-e0 | s0-e0 | cx:0.208 cy:0.058 w:0.591 h:0.515 angle:0 opacity:0.001 | translate: 0/0 easeOutCubic→easeOutCubic | 合格 |
| s0-e1 | s0-e1 | cx:0.018 cy:0.047 w:0.31 h:0.363 angle:0 opacity:0.001 | scale: 0/0.01 easeOutBack→easeOutBack | 合格 |
| s0-e2 | s0-e2 | cx:0.05 cy:0.012 w:776.021 h:775.998 angle:90.001 opacity:0 | grow: -6/-16.99 linear→- | 不合格 |
| s1-e0 | s1-e0 | cx:0.105 cy:0.028 w:0.163 h:0.189 angle:0.011 opacity:0.002 | rotate: 0/0 easeInOutQuad→easeInOutQuad | 合格 |
| s1-e1 | s1-e1 | cx:0.134 cy:0.115 w:0.623 h:0.567 angle:0 opacity:0.002 | translate: -0.01/0.01 easeInOutCubic→easeInOutCubic | 合格 |
| s1-e2 | s1-e2 | cx:0.003 cy:1 w:0.006 h:1.999 angle:0 opacity:0.008 | fade-in: 0/-15.61 easeInOutSine→easeInOutSine | 不合格 |

## 不合格の理由
- s0-e2: wの差が最大776.02（フレーム114、許容1.5）
- s0-e2: hの差が最大776.00（フレーム114、許容1.5）
- s0-e2: angleの差が最大90.00（フレーム98、許容1）
- s0-e2: 見え始めが-6フレームずれる（参考79、生成73）
- s0-e2: 種類が異なる（参考grow、生成rotate）
- s0-e2: growの開始が-6フレームずれる
- s0-e2: growの終了が-16.99フレームずれる
- s1-e2: hの差が最大2.00（フレーム222、許容1.5）
- s1-e2: 種類が異なる（参考fade-in、生成resize）
- s1-e2: fade-inの終了が-15.61フレームずれる

## 比較画像
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/dev/compare-1/cmp-f0040.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/dev/compare-1/cmp-f0075.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/dev/compare-1/cmp-f0076.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/dev/compare-1/cmp-f0077.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/dev/compare-1/cmp-f0096.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/dev/compare-1/cmp-f0189.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/dev/compare-1/cmp-f0232.png
- /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/dev/compare-1/cmp-f0268.png
- 比較動画: /Users/hongj/Documents/Codex/2026-10-08/ai-api-1-youtube-1-10/motion-lab/out/dev/compare-1/side-by-side.mp4
