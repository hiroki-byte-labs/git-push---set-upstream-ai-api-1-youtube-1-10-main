# 隔離した長尺リソース計測（T175）

```sh
./scripts/run scripts/benchmark-longform.ts --minutes 10 --dry-run
./scripts/run scripts/benchmark-longform.ts --minutes 10 --renderer native --audio mock --timeout 1800
```

`--minutes` は10・15・20。`--dir` を省略するとOS一時領域に一意の作業先を作る。指定する場合はリポジトリ外の空ディレクトリ、または既存の親直下の新規ディレクトリにする。既存内容・symlink・リポジトリ配下は書込み前に拒否する。

実行時はソース・素材を `workspace/` に複製し、子プロセスのcwdをそこに固定してsampleを実行する。依存パッケージとFFmpegのPython依存だけは既存環境を参照する。元のoutputs・Swiftキャッシュ・描画バイナリは共有しない。sampleは本人の工程を経ていないダミー台本のデモで、公開用作品ではない。`--audio mock` は合成確認音で、実ナレーションではない。

レポートはschema:2の `benchmark-report.json`。`outcome` は `estimated` / `passed` / `failed`。

- dry-runは `estimates` だけに概算を記録し、実測resourcesとsafetyThresholds.passedはnull。推計範囲内でも実レンダリング・媒体検査の成功を意味しない。推計の閾値超過はCLI終了1。
- 実行時はpsでsampleプロセスと子孫（Swift、FFmpeg、Chrome等）の同時RSS合計を約100ms間隔で採取し、その最大値と各PIDの最大値を保存する。監視する親ベンチマーク自身や無関係のプロセスは含めない。サンプリング間隔より短いピークや、親から離脱したdaemonの完全追跡は保証しない。メモリリークの有無をこの最大値だけで断定しない。
- ディスクは隔離workspaceのファイルサイズ合計を採取し最大値を保存する。共有依存symlinkの実体は含めず、APFSの物理占有量でもない。走査中に削除された一時ファイルのENOENTのみ許容し、それ以外の計測失敗は不合格。
- RSS/ディスク上限超過・タイムアウト時は今回の生成プロセスグループを停止する。既定は3072MiB・500MiB・1800秒。`--max-rss` / `--max-disk` / `--timeout` で正の有限値を指定できる。閾値は端末の全体負荷を保証するものではない。
- `workspace/outputs/latest.json` の実job IDを使い、完了jobと隔離先内の実MP4を要求する。元jobの検査JSONの合格フラグを流用せず、別の `independent-media/` で既存FFprobe/FFmpeg検査器を実行する。映像・音声・コンテナ尺（許容0.1秒）、H264/AAC、解像度、fps、全デコード、実デコードフレーム厳密一致、PCM尺・非無音を照合する。未測定・欠落・破損は不合格。
- fps/speedRatioは媒体検査成功時だけ算出する。経過時間はソース複製・コンパイル・sample処理までを含み、後段の独立媒体検査は含まない。

`render-command.json` とstdout/stderr、独立媒体検査JSONを作業先に保存する。ログへ動画/WAV/PCMをコピーしない。失敗後の調査用に作業先を保持し、同じディレクトリへの再実行は拒否する。再試行は新しい場所で行う。

ベンチマークはAVPlayerやブラウザーの実再生を自動で合格扱いしない。生成成功後、必要なら次の別検証を行い、倍率・終了・目視範囲を記録する。

```sh
swift scripts/verify-avplayer-playback.swift /absolute/path/to/sample.mp4 8 180
```

AVPlayerの8倍速・無音再生は、等速視聴やブラウザーの字幕操作、声質評価の代わりにはならない。Remotionとnative、10・15・20分はそれぞれ別の実行条件として結果を扱う。
