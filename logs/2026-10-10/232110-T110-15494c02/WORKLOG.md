# 作業記録 T110
- 記録者・実施者: Claude Code
- モデル: claude-opus-5-5 (runtime)
- 開始日時: 2026-10-10T23:21:10.140Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
参考動画のアニメーションをFFmpegで解析（シーン切替・動作区間・連続フレーム・時刻/位置/大きさ/種類/方向/速度/イージング/色/形/配置）してJSON保存し、Remotion+React+TypeScriptで自作素材により再現・レンダリング、参考動画とフレーム比較して差異を修正する。Remotion公式Agent Skillsを使い、元動画の素材・音声を流用せず、解析できない項目を断定せず、許可された素材だけを対象にし、実際にレンダリングして検証する。まず10秒程度の動画で最小限の検証環境を作る。

## 実施内容・変更ファイル
参考動画の動きの解析→JSON保存→Remotionでの再現・レンダリング→フレーム比較→差異の修正を回す最小検証環境を、本体と独立したサブプロジェクトとして作った。チケットはT110（新規、agent）。本人の作業はT111（新規、human、ready）に分けた。

新規ファイル
- motion-lab/（33ファイル、TypeScript約2,000行）
  - 設定: package.json（Remotion 4.0.534、@remotion/cli 4.0.534、react/react-dom 19.2.3、TypeScript 5.9.3等を完全一致で固定）、pnpm-lock.yaml、pnpm-workspace.yaml（インストールスクリプトを実行しない。esbuild: false）、remotion.config.ts（雛形＋Chrome for Testingモード）、tsconfig.json（Remotion側）、tsconfig.tools.json（解析器・試験）、eslint.config.mjs・.prettierrc（雛形のまま）、.gitignore（out/ と public/latest-analysis.json を除外）、README.md、remotion-skills.lock.json
  - shared/analysis.ts（解析JSONの型 motion-lab/analysis@1）、shared/easing.ts（14候補。RemotionのEasingと同じ数式）、shared/channels.ts（再現用チャンネルの評価）
  - tools/make-reference.ts（自作の10秒合成動画と正解値。Remotionと独立した描画器）、tools/analyze.ts（解析の本体とCLI）、tools/lib/ffmpeg.ts（FFmpeg呼出し、scdet、連続フレーム抽出）、tools/lib/vision.ts（背景推定、連結成分、サブピクセル計測、角の深さ）、tools/lib/fit.ts（区間検出、イージング当てはめ、判定）、tools/lib/elements.ts（追跡と図形ごとの解析）、tools/compare.ts（SSIM/PSNR、差分画素、比較画像・動画、生成動画の再解析による動きの比較）、tools/score.ts（正解照合）、tools/lab.ts（一括実行）、tools/fetch-remotion-skills.ts（公式Skillの版固定取得と照合）
  - src/index.ts・src/Root.tsx（雛形ベース）、src/Reproduction.tsx（合成。calculateMetadataで尺・大きさを解析動画に合わせ、SVGで描く。measured/houseの2テーマ）、src/channel-value.ts（interpolate/Easingでの評価）
  - tests/easing.test.ts、tests/fit.test.ts、tests/vision.test.ts（12件）
- .agents/skills/remotion-best-practices/（Remotion公式Agent Skills、77ファイル、改変なし。コミット32b241b、地図のSkillは除外）
- .agents/skills/motion-reference-reproduction/SKILL.md（今回の反復手順から作成）
- tickets/T110.md、tickets/T111.md

変更ファイル
- README.md（motion-labの節を追加）、docs/STATUS.md（先頭にT110の再開地点）、docs/DECISIONS.md（ADR-020）、docs/ASSETS.md（合成動画・公式Skill・Remotionの取得元と条件）、docs/SPEC.md（検証環境の節）

作業の流れ
1. 規約・README・SPEC・STATUS・AGENT-WORKFLOWを読み、check（OK: 78 tickets）とnextを実行。該当チケットがないためT110を作成してからstartした。
2. Remotion公式Agent Skills（remotion-dev/skills）をGitHub APIで確認し、版固定で取り込み。remotion-create・remotion-markup（compositions、calculate-metadata、parameters、timing、ffmpeg、multi-scene-video）・remotion-render・remotion-studioを読んで従った。
3. Skillの手順どおり `create-video@4.0.534 --yes --blank --no-tailwind` で雛形を作成（npmがないためpnpm dlx。入れ子のgitが作られるため作業用ディレクトリで作り、.gitを除いて複製）。
4. 合成動画の作成→解析を実行し、出力を見て解析器の不具合を直した（下記「判断と理由」の開発中の修正）。
5. Remotionでのレンダリングが停止する問題を切り分け、Chrome for Testingモードで解決。
6. 比較ツールを作り、1回目の比較で差異を確認→修正→再比較を4回（out/dev、iter2、iter3、final）。
7. 単体試験・型検査・ESLint・本体の試験と型検査を実行。Studioのプレビューを組み込みブラウザーで確認（3.1秒時点で長方形・円・伸びる帯が表示）。
8. Skill化の評価と作成・試用、チケット・文書・ログの更新。

## 判断と理由
- 本体と分離: 本体はSPECで「実行時npm依存なし」。Remotionはnpm依存が必須なので motion-lab/ に閉じ、版を固定した（ADR-020）。本体のcheck・試験・型検査の対象にも入らない（本体のtsconfigはsrc/testsだけ）。
- 参考動画: 利用を許可された外部素材が会話内で示されていないため、取得は一切せず、自作の合成動画（正解値つき）で検証した。描画はRemotion（Chromium）と独立した自作の描画器にし、「同じ描画器なので一致した」という循環を避けた。解析器は正解値を読まない。実在の素材での検証は本人の素材の用意後（T111）。
- 権利: 解析CLIは `--rights`（利用許可の根拠）がないと拒否し、analysis.json に保存する。動画の取得機能は作らない。再現はSVGの自作図形だけで、元動画の画素・音声・フォントは使わない。音声は解析しない。
- Remotionの版: 導入した公式Skillのversion（4.0.534）に合わせた。npmの公開日は2026-10-07で新しいが、Skillと版を一致させることを優先した（記録として明記）。
- 公式Skillからの意図的な逸脱: (1) 要素の数と動きは解析JSONで決まるため、要素はループで生成し、Interactive.withSchemaやinlineのinterpolate（Studioでの個別編集）は使っていない（Skillも「1つのテンプレートとして制御する場合はループ可」としている）。(2) 大きさの補間に `output: 'perceptual-scale'` を使わない（測った画素の大きさをそのまま再現するため）。(3) サブピクセル位置を正確に描くためCSSのボックスではなくSVGで描いた。いずれもsrc/Reproduction.tsxのコメントに理由を書いた。Skillの「明示的に頼まれたときだけレンダリング」は、今回の依頼が実レンダリングを求めているため該当する。
- 確からしさ: 全項目に measured/estimated/ambiguous/upper_bound/lower_bound/unknown を付け、unknownには理由を必須にした。イージングは雑音に対する有意差（Δχ²<9）で区別できなければambiguous、どの候補にも合わなければunknown（再現は測定値の折れ線）。
- 開発中に見つけて直した解析器の不具合（比較の前、合成動画の解析結果の確認で発見）: 雑音推定が中央値で、半分以上のフレームで動く帯の動きを雑音とみなした（下側20%点＋上限に変更）／形の判定に0.9度傾いたフレームを選び角丸と誤判定（傾きが最小のフレームを選ぶ）／色のばらつきを縁込みで計算（内部画素だけ）／帯の分類に外挿値を使いresizeと誤判定（観測したフレームの縁で判定）／幅0から始まる帯のモデル開始が不定（大きさ・不透明度は0以上の制約）。
- 1回目の比較で見つけた差異と修正（最終的な判断の根拠）:
  1. 参考動画で見えていないフレーム73〜78に帯の小片（幅15.6px）が出た。直線のイージングでは観測できない開始時刻と開始幅が同時に決まらず、外挿値で描いていた → 描くのは観測されたフレームだけ（render.from/to）。
  2. 生成動画の解析で、縦長→横長に変わる大きさの変化を90度回転と誤認 → 主軸の長さ（固有値）が一定のときだけ回転とする。
  3. 不透明度9%の観測で上端が欠け、高さ98px・別の動きと判定 → 背景との差がしきい値の3倍未満の観測は位置・大きさに使わず、不透明度だけに使う。
  4. （2回目）独自配色の角丸（半径18px）を面積比で矩形と判定し、回転中の幅が5.4pxずれた → 外接矩形の角から対角線上の被覆率で角丸半径を推定（参考動画の鋭い角は矩形のまま、独自配色は17.6〜18pxと推定）。見た目を意図的に変えた再現（house）は形・大きさ・見え始め・画素を判定に含めない。
  5. （2〜3回目）開始が観測できない動きで、色が変わると見え始めのフレームが2フレーム変わる（コントラスト依存）。モデル時刻での比較に変えたところ、画面外から入る長方形と帯の中心のモデル時刻が実行ごとに4.5〜11フレームぶれた → 当てはめの不確かさ（誤差がほぼ同じになる時刻の幅）を付け、最も識別できるチャンネルの値を採用。不確かさが1フレームを超えるもの（長方形: ±9.5）は識別不能として比較の判定にも使わず、upper_boundと見え始め・各フレームの軌跡で判定する。
  比較の基準値（SSIM・PSNR・位置1.5px等）は最初に決めたまま変えていない。比較方法の変更（4・5）は、その量が観測できる/できないの根拠に基づくもので、判定を通すために緩めたものではない。1回目の解析自体は正解照合67/67で、差異は再現側と、生成動画を測る解析器の頑健性にあった。
- Chrome: 既定のChrome Headless Shell（Chromium 157）は、未改変の雛形でも「Waiting for root component to load」で停止し、直接起動でも最小のHTMLで終了しなかった（サンドボックス外・GL切替でも同じ）。Remotionのソース（renderEntry.mjs）で、ルート描画後のrequestAnimationFrameで待ちを解除する作りを確認し、描画フレームが進まない問題と判断。公式の代替 `setChromeMode("chrome-for-testing")` で解決した（Chrome for Testing 185.8MBをRemotionが公式手順で取得）。
- Remotionのライセンス: 評価目的は無料ライセンスの対象（公式FAQ、2026-10-10確認）。商用利用の判断は本人に分けた（T111）。契約・購入はしていない。
- 定型作業のSkill化（routine-to-skill）: 候補は「解析→レンダリング→比較→差異の切り分けと修正」。今回の作業回で4回反復し（out/dev、iter2、iter3、final）、そのたびに差の原因（参考動画の解析／再現の入力／生成動画の計測）を切り分ける判断が必要だった。T111の後に実在の素材で同じ作業を行う予定があり、既存Skill（sample-render-verification は本体のsample用、repository-task-closeout は終了手順）とは目的が重ならないため、新規に `.agents/skills/motion-reference-reproduction/SKILL.md` を作成した。コマンドや基準はREADMEを正本として参照し、判断の分岐と実際に起きた失敗だけを書いた。権限（取得・契約・公開）は追加していない。試用として、Skillの手順3（読む順）とlab以外の単独CLI（compare --design-changed、score）を最終出力に実行し成功（evidence/skill-trial.txt）。試用で「理由文が識別できる場合も『識別できない』と書く」誤りと、証跡の終了コード記録（zshでPIPESTATUSが使えない）の誤りを見つけ、前者はコードを直して最終実行をやり直し、後者はパイプを使わない記録に変えた。同じ作業回でSkill化の再評価はしない。

## 検証コマンド・結果・証跡
証跡は evidence/。動画本体は入れていない（比較画像PNG 4枚と一覧画像1枚だけ）。Nodeは /Users/hongj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin をPATHに加えて実行（この端末の時点情報）。
- 開始時: `./scripts/run src/cli.ts check` → OK: 78 tickets / 終了記録の検査も成功。T110.md作成後のcheckは「終了記録後の変更: tickets/T110.md」で失敗（チケット作成のため想定どおり）し、startは成功。
- 公式Skillの照合: `node motion-lab/tools/fetch-remotion-skills.ts --check` → OK: 77 files @ 32b241b（motion-labからとリポジトリルートからの両方、EXIT=0。evidence/remotion-skills-check.txt）。最初はルート基準の相対パスでmotion-labからの実行が失敗したため、スクリプト位置から解決するよう直した。
- 一括実行（最終）: `cd motion-lab && node tools/lab.ts --run final --theme both` → EXIT=0（evidence/final-lab-log.txt、final-summary.json）
  - 正解照合 67/67（evidence/final-score.md）。開始が観測できない4件（長方形・円・帯・フェード）は upper_bound（真の開始15/36/78/216がそれぞれ上限16/37/79/222以下）と開始値unknown。モデル時刻は 円36±0.05、帯78±0.05、フェード216.1±0.2（識別できる）、長方形-3.36±9.5（識別不能・参考値）。
  - 再現（measured）: SSIM平均0.99939、最小0.99889（フレーム221）、PSNR平均48.41dB／最小44.49dB。動きは6図形とも合格（最大誤差 位置0.19px、大きさ0.62px、角度0.01度、不透明度0.008、イージング6/6一致）（evidence/final-compare.md、final-cmp-f0096.png）。
  - 独自配色（house）: 動きの判定に合格（SSIM平均0.97194は判定外）（evidence/final-compare-house.md、final-house-cmp-f0268.png）。
  - 連続フレームの一覧画像: evidence/final-seg00-contact.png（13〜67フレーム、番号つき）。
- 修正前（1回目、out/dev）: SSIM平均0.99938だが動きの比較で不合格（帯: 見え始め-6フレーム・種類の誤認、フェード: 高さ2px・種類の誤認）（evidence/iter1-compare-before-fix.md、iter1-cmp-f0076-stray-bar.png）。解析の正解照合は67/67（evidence/iter1-score.md）。2回目（evidence/iter2-summary.json: measured合格、house不合格2件）、3回目（evidence/iter3-summary.json: モデル時刻のぶれで不合格2件）。
- 単体試験: `cd motion-lab && node --test tests/*.test.ts` → tests 12 / pass 12 / fail 0、EXIT=0（evidence/motion-lab-tests.txt）。試験の初回は2件失敗したが、試験側の設計（振幅が小さすぎて区間検出前に落ちる、84%動く系列で中央値を試していた）の誤りで、意図どおりの条件に直して成功。
- 型検査: `tsc -p tsconfig.json`（src）EXIT=0、`tsc -p tsconfig.tools.json`（tools/shared/tests）EXIT=0（evidence/motion-lab-typecheck.txt）
- ESLint（Remotion公式設定）: `eslint src` → 0件、EXIT=0（evidence/motion-lab-eslint.txt）
- 本体: `./scripts/run --test tests/*.test.ts` → 191件成功 EXIT=0、`./scripts/run node_modules/typescript/bin/tsc --noEmit` → EXIT=0（evidence/root-tests.txt、root-typecheck.txt）
- 依存の再現: `pnpm install --frozen-lockfile`（pnpm 11.25.0）→ Already up to date、EXIT=0
- Chromeの停止の記録: evidence/headless-shell-timeout-log.txt（--log=verboseの抜粋）
- Studio: `remotion studio src/index.ts --no-open --port=3123` を起動し、組み込みブラウザーで最新の解析が読み込まれ、3.1秒時点の描画を目視確認。
- Skillの試用: evidence/skill-trial.txt（compare --design-changed EXIT=0 合格、score EXIT=0 67/67）
- `./scripts/verify` と最終の `check` は作業回を閉じた後でないと成功しないため、finish後に実行して結果を利用者へ報告する（このログには含まれない）。

## 未実施・制約
- 実在の参考動画での解析・再現・比較は未実施（許可済みの素材がない）。合成動画での合格は、単色背景の上の重ならない単色図形という前提の中での結果で、実在の動画で同じ精度が出る保証ではない。
- 解析の対象外: 文字・写真・グラデーション・重なり・遮蔽・3D・粒子・ディゾルブ等の切替効果、音声。等方的な図形（正方形・円）の回転、回転と拡大縮小の同時発生、回転する角丸矩形の大きさ（矩形の式で数px偏る）。イージングは14候補だけで、ベジェ・ばねの当てはめは未実装（unknownとして折れ線で再現）。
- 開始（終了）が観測できない動きの時刻は上限（下限）としてだけ報告。モデル時刻は不確かさ付きの参考値。
- 独自配色（house）の比較は動きだけ。見た目の良し悪しは人の確認をしていない（T110の受け入れ条件外）。
- Studioの右欄に「Can't save default props」の注意が出る（defaultPropsの書き戻し機能）。描画・プレビューには影響しないが、原因は調べていない。
- Remotionのライセンスは評価目的での導入。商用利用の可否は本人の判断（T111）。契約・購入・有料API・デプロイ・push・投稿はしていない。コミットもしていない。
- 取得したもの: npmの依存387件（pnpm、レジストリ）、Remotion公式Skill 77ファイル（GitHub、固定コミット）、Chrome for Testing（Remotionの公式手順、185.8MB、node_modules/.remotion/）。いずれもGit対象外または版固定。

## TODO・再開方法
- 現在の状態の正本は tickets/T110.md（done）と T111.md（human、ready）。
- 本人: T111の手順で、許可済みの10秒程度の動画と根拠、Remotionの利用形態を共有する。
- エージェント（T111の共有後、新しい作業回）: `cd motion-lab && pnpm install --frozen-lockfile && node tools/lab.ts --run <名前> --reference <動画> --rights '<根拠>' --theme both` を実行し、`out/<名前>/compare/compare.md` と analysis.json の unresolved を報告する。手順と分岐は .agents/skills/motion-reference-reproduction/SKILL.md。Nodeは PATH か NODE_BIN の場所のnodeを使う。
- 実在の動画で対象外の素材（文字・重なり等）が多い場合の拡張候補（未チケット化）: ベジェ・ばねのイージング当てはめ、重なり・遮蔽の分離、文字領域の扱い、Studioでの個別編集（Interactive.withSchema）。必要になった時点で別チケットにする。
- Remotionが更新されたら `remotion-upgrade` Skillに従い、Skillの版（fetch-remotion-skills.tsのCOMMIT）とpackage.jsonの版を一緒に上げ、`node tools/lab.ts` で再検証する。
