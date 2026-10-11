# 統合試作の実再生（T106-6、2026-10-10 UTC、Claude Code）
Skill `.agents/skills/sample-render-verification` の手順で実施（試用）。隔離コピー scratchpad/iso-t106-after。

## 生成（デモ案件、記録者test-agent。integrated/produce-flow.txt）
produce new --demo → select price-index → render（拒否: 考察未入力・台本未作成）→ reflection（デモ用の仮文）→ script（fixtures/draft-price-index.json）→ script-review approve → render（720p）/ render --resolution 1080。サムネイル見出しの改行対応のため下書きを更新し、台本v2を作成・承認して再制作（720p: price-index-v2-e82d0166、1080p: price-index-v2-c0838378）。台本v1の動画2件は失効表示になった（T104の動作どおり）。

## 自動検査（integrated/*/job.json、media-check.json）
- 両解像度: 83秒、1992/1992フレーム、全デコード、PSNR最小 40.0 dB（720p）/ 40.6 dB（1080p）、字幕は焼き込み（ソフト字幕ストリーム0）、音声83.03秒、narration=false。
- lint error 0 / warning 0。文字配置 ok（2300件）、見やすさ ok（最小17pt相当、最小コントラスト比6.32）、サムネイル3案 ok。

## 組み込みブラウザーでの再生（720p、http://127.0.0.1:4173/job/price-index-v2-e82d0166）
- readyState 4、1280×720、duration 83、error null。画面にデモの注意（制作案件 production-demo-e8e39076から作成）と「文字配置: OK（2300件を検査）」を表示。
- ミュートで再生し、ペイン非表示による一時停止（pause@0.0/19.6/27.6/48.4/51.5/61.9/72.4）のたびに再開して ended まで再生。最終 currentTime 83、デコードしたフレーム 1992（期待値と一致）、dropped 0。音声デコードのバイト数が 30278→61036 へ増加（AAC音声トラック。内容は確認音でナレーションではない。スピーカーでは聴いていない）。
- 映像面は非表示ペインのスクリーンショットに描かれないため、MP4からフレーム200/300/560/800/1200/1320/1560/1900をデコードして目視（integrated-frames.png）: 章ラベル、焼き込み字幕が枠の上下左右の中央、強調語が題名の下、架空の例の札、集計の図、「デモ: 仮の考察（本人ではない）」の札、出典の表示。動き（motion-frames.png）: フレーム721/725/731で矢印が伸び次の段が現れる、962/966で棒が伸びる、1108/1120で「まとめると」の字幕と同時に平均の棒が伸びる。
