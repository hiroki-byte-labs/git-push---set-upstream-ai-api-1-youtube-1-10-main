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
