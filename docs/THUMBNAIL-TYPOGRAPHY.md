# サムネイル文字装飾（T185）

通常のPlan v2のthumbnailに以下を指定すると、native/Remotion共通の専用PNG描画で使用する。指定しなければ従来の書体・レイアウトを使う。設定変更はサムネイル入力hashに入り、生成PNG/metadataの変更は既存の確認対象版へ反映される。

```json
{
  "headline": "なぜ一人に？",
  "typography": {
    "family": "mincho",
    "weight": 900,
    "emphasis": ["一人"],
    "outline": true,
    "glow": true,
    "gradient": true
  }
}
```

familyはmincho（Noto Serif JP）またはgothic（Noto Sans JP）、weightは700/800/900。漢字を標準の1.10倍、ひらがな・句読点等を0.78倍、明示emphasisを1.22倍にし、同じ本文のまま強弱を付ける。候補に存在しない強調語は候補生成時に除外する。装飾は黒い外縁＋明るい内縁、控えめな影のグロー、白〜淡い金の文字内部グラデーション。フレーム外の切れを避ける余白と、主見出し/補足の実測衝突検査を設ける。

動画を作らずに3候補を出力する場合:

```sh
./scripts/run src/thumbnail-cli.ts fixtures/sample-superstar-illustration.json /tmp/new-typography-preview mincho
```

CLIは既存ディレクトリを上書きしない。1280×720、320×180、160×90 PNGと品質結果を出力し、canProceed=falseなら終了1。API利用時は `buildThumbnailCandidates(plan, {typography: ...})` → `renderThumbnails` → `checkThumbnailQuality`。本番の採用・好みの判断は本人確認へ渡す。

フォントは `assets/fonts/` にオリジナルの可変TTFと各OFL文書を同梱し、manifest.jsonに出典・確認日・フォント/ライセンスSHA-256を記録する。無改変のOFL-1.1配布物。フォントそのものを単独で販売しないこと、再配布時に著作権・ライセンス文書を保持することを前提とする。ユーザーのフォントコレクションにはインストールせず、描画プロセス内で登録する。選択時はファイルのhash不一致を拒否し、実際のフォント名・weight・使用ファイルhashを描画レポートに残す。

出典（2026-10-16確認）:

- [Noto Serif JP / OFL](https://github.com/google/fonts/blob/main/ofl/notoserifjp/OFL.txt)
- [Noto Sans JP / OFL](https://github.com/google/fonts/blob/main/ofl/notosansjp/OFL.txt)

比較出力: `work/T185-review-2026-10-16/final-mincho/`（格差）と `work/T185-review-2026-10-16/final-gothic/`（名字）。幾何モチーフは既存のまま。美的評価やCTR改善、具象コラージュ（T183/T184）の完了を意味しない。動画生成を隔離コピーで試す場合はフォントを含むassetsもコピーする。
