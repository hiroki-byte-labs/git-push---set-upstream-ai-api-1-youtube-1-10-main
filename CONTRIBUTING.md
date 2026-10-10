# 人・AI共通の開発入口
使用するエディタやAI製品にかかわらず、[AGENTS.md](AGENTS.md) と [共通ワークフロー](docs/AGENT-WORKFLOW.md) に従ってください。

タスク担当のagentに製品の優先順位はありません。実施者とモデルを作業ログで識別します。タスク開始はworklog start、終了・中断は本文記入とworklog finish、その後cli checkが必須です。clone時にscripts/install-hooksを実行してください。

AGENTS.mdを自動読込しないツールには、このファイルまたはAGENTS.mdを開始指示として渡してください。外部ツールが規約を読むこと自体をリポジトリから強制はできませんが、Gitコミット時は同じ終了検査が働きます。
