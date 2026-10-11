# 設計判断
2026-10-08 / ADR-001: 空のディレクトリを新規リポジトリとして使用。既存コード、上位/配下AGENTS.md、既存Gitはなし。既存outputs/work空ディレクトリを維持。

ADR-002: TypeScriptをNode 24の型除去で直接実行する。npm依存・ダウンロードなし。型除去は型検査ではないので、実行時入力検証とNodeテストを実施。静的型検査導入は別チケット。公式: https://nodejs.org/api/typescript.html （2026-10-08確認）。

ADR-003: Remotionは候補として保留。環境にNode/FFmpegの通常PATHがなく、Mac標準Swiftが利用可能。追加ダウンロードをせずM1を確認するため、描画・書出しだけSwiftへ分離。将来VisualProviderを交換。Remotion公式のライセンスは組織規模等で異なるため導入時に再確認する。https://www.remotion.pro/license / https://github.com/remotion-dev/remotion/blob/main/packages/core/LICENSE.md （2026-10-08確認、未導入）。

ADR-004: 音声は自作正弦波の確認音。Appleシステム音声は利用範囲に制約があり、事業用素材として安易に採用しない。https://www.apple.com/legal/sla/ 。ナレーション品質はM1の実証に含めない。ユーザーのM1条件「短い動画・音声を含む」と模擬実装を許す条件を根拠とする。完成品の10〜20分要件を36秒で満たしたとは扱わない。

ADR-005: 開発チケットは簡単なfront matter付きMarkdownのみが正本。表示一覧は読み取り時に生成。制作ジョブは実行ごとのJSON。依存グラフ検証はID重複、欠落、循環、doneの依存未完了を拒否する。

ADR-006: 外部接続なし・publish無効。ローカルHTTPプレビューは127.0.0.1のみ。停止はCtrl+C。Swiftは固定プログラムを引数配列で実行し、入力をシェルに埋め込まない。

映像API参照: https://developer.apple.com/documentation/avfoundation/avassetwriter / https://developer.apple.com/documentation/avfoundation/avassetexportsession （2026-10-08確認）。

ADR-007: 実機検証でAVFoundationのH264/JPEGエンコーダーが利用不可（-11834 / -12903）。SwiftはAppKitによるPNG描画だけに縮小。FFmpegのlibx264/AACに書出しを変更。imageio-ffmpeg 0.6.0のmacOS arm64 wheelをPyPIからworkへ取得。生成は取得後オフラインで可能。依存バイナリはGitに含めず再配布しない。ライセンスはビルド構成により異なるため、配布する段階では再確認する。公式: https://github.com/imageio/imageio-ffmpeg / https://ffmpeg.org/legal.html （2026-10-08）。ADR-003のAVFoundation書出し方針は本判断で置換。

ADR-008 / 2026-10-08 / T010: ユーザーのエージェント中立化依頼により、owner: codexをowner: agentへ移行。人の作業はhumanのまま。本人性の表示はログのagent/model/modelSourceで分離し、任意文字列を受け付ける。歴史的なCodex表記は削除しない。scripts/runの端末固有パスを除去しPATH/NODE_BIN方式へ変更。

ADR-009 / 2026-10-08 / T010: 指示文だけでは記録漏れを防げないため、open→completed/pausedのログCLIとSHA-256照合、Git index検査を導入。clone内のpre-commitを有効化。外部CIは今回未導入。意図的回避を完全防止するとは主張しない。1作業ツリー1未終了ログとし、並行エージェントのロックサービスは設けない。過去手作業ログを残し新形式session.jsonから検証開始。新形式の時刻はUTC。

ADR-010 / 2026-10-08 / T011: 定型作業をSkill化するroutine-to-skillを作り、過去のT009/T010と今回のT011へ適用。終了作業をrepository-task-closeoutとして抽出。原本は.agents/skills、個人ランタイムへの導入はコピーとし一致ハッシュを記録。正本のCLIや手順書を複製する補助スクリプトは追加しない。単発のエンコーダー障害や未承認の投稿を汎用Skill化しない。候補の見送りと再帰防止を明文化。

ADR-011 / T008: 残件解消の依頼で静的型検査を導入。T006の目視再生と型検査は技術的に独立なので依存をT005へ変更。strict/noEmit/allowImportingTsExtensions採用。公式確認: https://www.typescriptlang.org/tsconfig/strict.html / https://www.typescriptlang.org/tsconfig/allowImportingTsExtensions.html （2026-10-08）。既存Node 24環境に対しTS 5.9.3とNode型24.10.0を固定。最新であるとの主張ではない。

ADR-012 / 2026-10-08 / T020,T030: AI接続はGemini台本→音声（ElevenLabsとGemini TTSを同一台本で人が聴き比べ）→必要箇所のみRunwayの順。公式調査は要約取得のため、金額・規約は契約前に人が再確認する（docs/RESEARCH-AI.md, docs/RESEARCH-YOUTUBE.md）。T021/T022を親にして接続別の人/実装チケット（T023–T029,T060）へ分解。YouTubeは非公開から開始。未監査プロジェクトの非公開制限は公式間で矛盾するため実機確認する。Node型除去モードでは引数プロパティ構文が使えないため通常のフィールド宣言にする。

ADR-013 / 2026-10-08 / T013: T012レビューを受け、ログの品質検査（同一本文の節の拒否、evidence参照の実在確認）はfinish時だけに適用する。終了済みの過去ログ（T008等）は当時の基準で検証し、改変しない。pre-commitはログ検査に限定し、テスト・型検査は手動のscripts/verifyで行う（hookの試験用fixtureとの競合と、コミット時間を避けるため）。描画の接続種別名はlocal.appkit-ffmpeg。過去のjob.jsonの値は当時の記録として残す。

ADR-014 / 2026-10-08 / T014〜T044, T024, T033: エンハンス一括実施の主な判断。
- 台本は内部でv2に統一し、v1は読込時に変換する。
- 区間計算（TS）と描画（Swift）を分ける。
- フレームは整数で、書出しはfps＋tpad＋-frames:vにする（-rだけでは欠落した）。
- 安全検査は費用が発生する工程の前に置く。
- 接続はmock/local/realを区別し、予算の既定は0 USD。
- 承認は表示した版のハッシュと一致するときだけ記録し、ファイル変更で失効する。POSTはHost/Originを検査する。
- outputsの整理は削除ではなく_trash/_archiveへの移動にする。
理由と検証は各作業ログとdocs/HANDOFF.md。

ADR-015 / 2026-10-10 / T095: 承認は動画単体ではなく、確認対象一式（動画、採用タイトル・概要欄・タグ・チャプター、字幕、サムネイル全案）の版に結び付ける。版は欠落をnullとした固定順序のJSONのSHA-256で、承認時と判定時に同じ関数（reviewBundle/bundleHash）を使う。採用サムネイルの選択機能がないため全案を対象にする（保守的）。台本・検査記録・見直し履歴・review.json・時刻は対象外。旧形式（動画のみ）の承認は一式へ拡張せず再確認が必要な状態にし、過去のreview.jsonは書き換えない。

ADR-016 / 2026-10-10 / T098: 予約・精算を呼出し全体から試行単位に変更する。失敗した試行の費用はConnErrorのcharge（none=確実に未処理、unknown=不明。既定unknown）で接続側が示し、unknownは予約を解放せずBudget.unknownに保持して上限判定に含める。照合（任意のreconcile）で判明した費用は一度だけ確定する。全試行をローカルのattemptIdと接続先のproviderRequestIdで区別してjob.json.attemptsに記録する。冪等キーでの再送無課金は接続先の根拠がないため採用しない。手元処理（LocalConnection）の失敗はnone。DB・分散実行・永続化はM5の範囲として扱わない。

ADR-017 / 2026-10-10 / T103: 新テーマ（日常に結び付く知識全般）に合わせ、台本v2へ任意欄`theme`（general/investment）と`intro`（概要欄の導入文、出典id、fictional）を追加する。schema番号は上げない（任意欄の追加で、既存のv1/v2はそのまま読める）。theme未指定は旧形式の投資テーマとして扱い、投資の免責（推奨・保証の否定）を従来どおり要求する（既存fixtureが一般テーマ扱いになって検査を回避しないため）。一般テーマは「結果を保証しない」否定文だけを求め、投資の定型免責は強制しない。ただしthemeの付け替えで検査を外せないよう、一般テーマでも投資の語（INVESTMENT_TERMS）があれば投資の免責を求め、禁止表現・出典なし数値・具体例の区別・サムネイル文言はテーマによらず適用する。効果・結果の断定（必ず痩せる、効果を保証します等）を禁止表現へ追加。導入文は具体例と同じく、出典つきか架空の明示を必須にする。出典の番号付けはsourceRecords（src/metadata.ts）に一本化し、概要欄・metadata.json・画面の[n]で一致させる。導入文の欠落は他の構成規則と同じく本番尺でerror・試作でwarningとし、旧fixtureの警告数を数える既存試験は規則ごとの判定へ変更した。出典URLの記録は主張の検証済みを意味しないと明記し（metadata.json sourcesNote）、照合は人の台本確認（T104）で行う。

ADR-018 / 2026-10-10 / T104: 本人が担う工程（題材の選択、考察の執筆、台本の承認、完成動画の承認）を制作ジョブとして記録・強制する。
- 保存先: 開発チケットではなく outputs/ の「制作案件」ディレクトリ（kind=production-project、id=production-xxxxxxxx、デモはproduction-demo-xxxxxxxx）のjob.json.workflow。履歴は追記のみ（selections/reflections/scripts/scriptReviews/renders）で、現在値は各履歴の末尾。台本の版は script-vN.json として同じディレクトリに置く。
- 制作（描画）は従来どおり不変の制作ジョブ（outputs/<台本id>-xxxxxxxx）を新規に作り、job.jsonに project・scriptHash・mode を記録する。再制作で既存の動画を上書きしない（ADR-014の方針を維持）。
- 台本の版（scriptHash）は、選択した候補の内容、考察の版番号とSHA-256、台本ファイルのSHA-256を固定順序のJSONにしたSHA-256。題材・考察・台本が変われば版が変わり、台本承認は版に結び付くので失効する。job.jsonのevents等の運用記録は版に含めない（失効しない）。
- 台本は「考察の場面（role: reflection、本文は【本人の考察：未入力】）」を1つ持つ下書きに、本人の考察（最新版）を差し込んで作る。考察が未入力なら台本を作れず、下書きのまま制作するとlintのerror（reflection-missing）で止まる。考察の差し込みは本文を変えず、字幕は文単位で55字以内に分割、尺は6字/秒（下限4秒・上限120秒）で決める。
- 本人の考察をエージェントが整えた版は authorship=assisted とし、本人執筆（self）の版を basedOn に必須とする。元の本人の文章は履歴に残り、同一扱いしない。
- 制作の開始（produce render）は、未選択・考察未入力・台本未作成/古い・台本未承認なら拒否し、不足項目を表示する。強制で工程を飛ばすオプションは設けない。
- 完成動画の承認は既存の確認対象一式（ADR-015）に台本の版（script）を加えて結び付ける（制作案件から作った動画だけ。既存ジョブの版は変わらない）。制作案件の現在の承認済み台本と一致しない動画は、承認済みでも「失効」と表示し、新たな承認も拒否する。
- デモと本番: 既存の sample は常にデモ（mode=demo）。modeのない既存ジョブはデモ（旧ジョブ）として表示し、ファイルは書き換えない。デモ案件（--demo）は試験用で、記録者にtest-agent等を使う。本番案件では、本人の工程（選択・考察self・台本承認・動画承認）をエージェント名らしい記録者名（agent、claude、codex、gpt、gemini、bot等）で記録できない。公開前の判定（publishReadiness）は本番案件・本番ジョブ・現在の承認済み台本・動画承認のすべてを要求し、デモの承認は転用できない。投稿は引き続き無効。
- 限界: 記録者名は自己申告で認証ではない。job.jsonの手編集を完全には防げない（ハッシュとの照合で不整合を検出する範囲）。

ADR-019 / 2026-10-10 / T106: 見せ方の改善。
- 字幕の既定を焼き込み（burn）に変更する。T078では研究（E12）を根拠に切り替え式を既定にしたが、利用者がT007で焼き込みを希望したため、本人の希望を優先する。soft/bothは引数で引き続き選べる。研究上の不利（全文字幕とナレーションの重複）はナレーション接続後の試聴（T077）で再評価する。
- 文字の描画を「固定の高さ100の枠の上端から描く」方式から「入れ物の枠を決めて計測し、上下中央（または上寄せ）に置く」方式へ変更する。画面を区画（header/title/emphasis/diagram/subtitle/footer）に分け、区画の座標はscripts/render.swiftとsrc/layout.tsで一致させる（試験で照合）。描いた外接矩形をrender-report.jsonへ記録し、はみ出し・中央からのずれ・区画外・区画をまたぐ重なりを検査してjob.json.layoutに残す（不合格でも制作は止めず、確認で直す。見やすさの検査と同じ扱い）。
- 強調語の札は字幕の有無によらず題名の下の区画に置く（旧方式は焼き込み字幕の上やフッターの上に出て重なった）。
- 意味を示す動きとして、集計の図（meter、値は−1〜1の相対値で数値は表示しない）と、流れ図の経緯の矢印（motion: travel）を追加する。動きは12フレーム（0.5秒）で、1フレームずつの区間として書き出す。段の表示時刻は任意の diagram.reveal（先頭0・昇順）で説明に合わせる。外部の素材・生成映像は使わない。
- サムネイルを問い型（a）・図解型（b、サムネイル用に要素を減らして大きく描く）・対比型（c）に再設計する。参考動画は観察だけで、絵柄・素材は複製しない（docs/T106-DESIGN.md）。thumbnail.keyword・contrastを任意で指定でき、禁止表現の検査は改行を除いた文言で行う。
- 構成の合意とサムネイルの選択は本人の判断のため、T106はreviewで残す。

ADR-020 / 2026-10-10 / T110: 参考動画の動きの解析・再現の検証環境を、本体と独立したサブプロジェクト motion-lab/ に置く。
- 本体の「実行時npm依存なし」（SPEC）は変えない。Remotion（4.0.534）・React・ESLint等はmotion-lab/package.jsonとpnpm-lock.yamlに閉じ、版を完全一致で固定する。Remotionの版は導入した公式Agent Skills（remotion-dev/skills、コミット32b241b、Skillのversion 4.0.534）と合わせる。依存のインストールスクリプトは実行しない（pnpm-workspace.yamlでesbuildも無効。同梱バイナリで動作を確認）。
- 公式Agent Skillsは、Skillの共有原本の置き場所である .agents/skills/ に、取得スクリプトとSHA-256の記録（motion-lab/remotion-skills.lock.json）で版を固定して置く。使わない地図のSkillは見本データが大きいため除外する。特定AIの自動発見には依存しない。
- 解析器はNode 24の型除去で動くTypeScript（npm依存なし）で、FFmpegは本体と同じ探索順（FFMPEG_BIN → work/ → PATH）。図形の切り出しは単色背景・重ならない単色図形を前提とし、前提外はunknownとして記録する。
- 検証用の参考動画は、許可済み素材がないため自作の合成動画とし、Remotion（Chromium）とは独立した自作の描画器で作る（解析と再現の両方を検証するため）。正解値は採点だけが読み、解析器は読まない。
- 観測できない項目は断定しない: 確からしさ（measured/estimated/ambiguous/upper_bound/lower_bound/unknown）を全項目に付ける。再現では観測されたフレームだけ描き、観測できない区間をモデルの外挿で描かない。不確かさが1フレームを超えるモデル時刻は比較の判定にも使わない。いずれも1回目の比較で実際に起きた差異から決めた（T110の作業ログ）。
- Chrome Headless Shell（Chromium 157）がこの端末（macOS 26）で描画開始前に停止したため、公式の代替であるChrome for Testingモードを使う（remotion.config.ts）。
- Remotionは評価目的で導入した（無料ライセンスの対象）。従業員4人以上の営利組織が商用に使う場合はCompany Licenseが必要で、判断は本人（T111）。動画の取得機能は持たず、解析には利用許可の根拠（--rights）の記録を必須にする。
