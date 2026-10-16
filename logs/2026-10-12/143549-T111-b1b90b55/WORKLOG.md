# 作業記録 T111
- 記録者・実施者: Codex
- モデル: gpt-6-luna (runtime)
- 開始日時: 2026-10-12T14:35:49.615Z / UTC
- 記録種別: 同時記録

## 依頼・許可範囲
T111について、個人がYouTube収益化にRemotionを使う場合の利用条件を商用利用・会社規模・Company License要否に沿って確認する。

## 実施内容・変更ファイル
- Remotion公式License FAQを確認し、個人・小規模組織の商用利用条件とCompany License要否を整理。
- tickets/T111.mdに確認結果と残件を記録。
- docs/STATUS.mdに現在の再開地点を追記。参考動画と権利根拠が未共有のためT111はreadyのまま。
- 公式FAQの確認事項を evidence/remotion-license-review.md に保存。

## 判断と理由
個人は商用利用を含めFree License対象で、FAQはFree Licenseで収益化できると明記している。よって、本人が個人として自分の収益化YouTube動画を制作する場合、Remotion Company Licenseは不要。3人以下の組織・チームも対象。4人以上の営利組織はCompany Licenseが必要で、手動の動画制作か自動化製品かに応じてプランが異なる。チケット全体の受け入れ条件のうち許可根拠つき動画が未共有なので、完了にはしない。
定型作業Skill評価: この公式ライセンスFAQを調べる作業の反復根拠は確認できず、既存Skillで十分な再利用手順もないため新規作成・更新は見送り。

## 検証コマンド・結果・証跡
- `./scripts/run src/cli.ts check`: 作業開始前に成功（OK: 90 tickets、sessions 78）。
- `./scripts/run src/cli.ts next`: 作業開始前に成功。T111が利用者側の次作業として表示された。
- 公式ページ確認: https://www.remotion.dev/docs/license/faq。要点を `evidence/remotion-license-review.md` に記録。
- `./scripts/run src/worklog-cli.ts finish logs/2026-10-12/143549-T111-b1b90b55 --status completed` 後に `./scripts/run src/cli.ts check` を実施する。

## 未実施・制約
- 利用を許可された実在参考動画の提供・権利根拠の確認とmotion-lab実行は未実施（利用者待ち）。
- Remotion Terms and Conditions全文の法的評価は未実施。規約上の最終判断には正式文書を参照する。
- Company License購入、契約、有料API、動画取得は行っていない。

## TODO・再開方法
利用者は解析対象の約10秒動画をGit管理外に置き、ファイル場所、許可根拠1行、個人/組織での利用形態を共有する。受領後は新しい作業回を開始し、`.agents/skills/motion-reference-reproduction/SKILL.md` に従い `motion-lab/tools/lab.ts --reference <動画> --rights '<根拠>'` を実行する。
