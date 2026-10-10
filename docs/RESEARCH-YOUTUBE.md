# YouTube公開制限と認証審査の調査（T030）
確認日: 2026-10-08 / 記録: Claude Code (claude-sonnet-5-5)。公式ページをWebFetch要約経由で確認（原文全文の確認ではない）。認証・サインアップ・投稿は一切していない。

## 最重要（T031/T032の前提）
- クォータ体系は2025-12〜2026-06に変更されている。旧「videos.insert=1,600ユニット」は使わない。
- **未監査プロジェクトの非公開制限が現行で有効か、公式ページ間で矛盾**（videos.insertリファレンスは「制限されない」、改訂履歴2020-07-28とヘルプは制限ありと記載。解除の改訂項目は見つからず）。結論: **不明。未監査プロジェクトから非公開で試験アップロードして実機確認する**（公開での試験はしない）。

## 事実（公式URLは各項）
- クォータ（https://developers.google.com/youtube/v3/determine_quota_cost, /docs/videos/insert, /revision_history）: videos.insertは専用バケットで1ユニット/回・100回/日、search.listも専用100回/日、その他は合算10,000ユニット/日。videos.list/playlistItems.list=1、videos.update=50。リセットは太平洋時間0時。増枠は監査完了が前提（/guides/quota_and_compliance_audits）。
- 監査（同URL、https://support.google.com/youtube/contact/yt_api_form, https://support.google.com/youtube/answer/7300965）: Audit and Quota Extension Form。組織情報、事業内容、プライバシーポリシー・利用規約URL、デモアカウント、利用ケース等が必要。所要期間と個人1チャンネルが対象かは**未確認**。ロックされた動画は異議申し立て不可、収益化不可。
- OAuth（/docs/videos/insert, https://support.google.com/cloud/answer/15549945, /13463073, /guides/auth/installed-apps）: スコープはyoutube.upload（最小）等。テストモードは認可・リフレッシュトークンが7日で失効。youtube.uploadがセンシティブ/制限付きのどちらか、本番化で7日失効が避けられるか、検証の書類・期間は**未確認**（Cloudコンソールで確認）。
- 設定項目（/docs/videos）: privacyStatus、publishAt（private時のみ。過去日時は即公開）、selfDeclaredMadeForKids、containsSyntheticMedia。
- 再開可能アップロード（/guides/using_resumable_upload_protocol）: Locationのセッション、`bytes */N`で再開、5xxは再試行、404はセッション期限切れ。冪等性キーの有無は未確認。重複照合はsearch.listよりplaylistItems.list/videos.list（各1ユニット、専用バケットを消費しない）が安全（推奨案・推測）。
- 運用（https://support.google.com/youtube/answer/171664, /71673）: 電話認証で15分超アップロード可。API経由での電話認証必須かと日本固有条件は未確認。
- 収益化（https://support.google.com/youtube/answer/72851, /13429240）: 1,000人＋視聴4,000時間等、審査あり、**承認も収益も保証されない**。2027-02-01に制度更新（詳細未確認）。日本が対象国かは未確認。
- ポリシー（https://support.google.com/youtube/answer/1311392, /14328491）: 大量生産・反復のコンテンツは「真正性のないコンテンツ」で収益化対象外。リアルな合成・改変は開示が必要。YouTube API Developer Policiesの個別条項は未精読（T031前に確認）。

## 決定
投稿は非公開から始め、公開は人の承認後。AI開示基準と、収益化を前提にしない運用方針をT031で人が決める。
