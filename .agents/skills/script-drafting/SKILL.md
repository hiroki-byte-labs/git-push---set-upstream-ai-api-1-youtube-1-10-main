---
name: script-drafting
description: AIエージェントが承認済み題材と本人の考察から、台本・公開用テキストの下書き（Plan v2）を作成・改定し、制作パイプライン（produce script）へ受け渡す手順を規定する共有Skill。「台本を下書きして」「台本案を作って」「差戻し理由を反映して」と指示されたときに使う。
---

# 台本・公開用テキスト下書き手順（script-drafting）

正本は `AGENTS.md`、`docs/REFERENCE-STYLE-POLICY.md`、`docs/AUTONOMOUS-DOCUMENTARY-PIPELINE.md`、`tickets/T123.md`。
このSkillは、Gemini API等の外部台本生成APIに依存せず、リポジトリ内のAIエージェント（Antigravity、Claude Code、Codex）が共通の形式・品質基準に従って台本下書き（Plan v2 JSON）を作成し、本人の考察工程および制作パイプライン（`cli.ts produce`）へ接続するための共有手順を定義する。

> [!IMPORTANT]
> - **本人の考察（reflection）をエージェントが代筆・創作してはなりません**。下書きでは `role: "reflection"` の本文およびcueを必ず `【本人の考察：未入力】` とし、本人が `produce reflection` で執筆した文章を `produce script` が差し込みます。
> - **台本の承認をエージェントが代行してはなりません**。承認は本人が `produce script-review` で行います。

---

## 1. 台本下書きの基本構造（Plan v2 JSON）

知的好奇心探究型ドキュメンタリーの下書きは、`src/plan.ts`（schema: 2）に準拠した以下の構成スロットを網羅する:

```json
{
  "schema": 2,
  "id": "英数字ハイフン（例: superstar-economics-v1）",
  "title": "タイトル（60字以内。問いの形式）",
  "version": 1,
  "theme": "general",
  "promise": "この動画で視聴者が得られる知見・問いの答え（30〜60字）",
  "note": "台本下書きの作成者・目的・出典確認情報のメモ",
  "intro": {
    "text": "概要欄先頭に掲載される導入文（150〜300字）。日常の疑問から本題への橋渡し。",
    "sources": ["一次文献ID"],
    "fictional": false
  },
  "glossary": [
    {
      "term": "専門用語（初出前に定義）",
      "definition": "日常語による簡潔な定義"
    }
  ],
  "thumbnail": {
    "headline": "サムネイル見出し（6〜8文字程度。2行改行可）",
    "sub": "補足コピー（対比構造や問い）",
    "scene": 2,
    "keyword": "核となるキーワード",
    "contrast": ["A（直感・多数派）", "B（現実・勝者）"]
  },
  "sources": [
    {
      "id": "文献ID",
      "title": "著者名 (発行年)『文献名』",
      "url": "https://...",
      "accessedAt": "YYYY-MM-DD"
    }
  ],
  "scenes": [ ... ],
  "aiDisclosure": { ... }
}
```

---

## 2. 5大章立て・シーン構成指針

ドキュメンタリーの構成は、以下の5つの章（chapter）を基本とする:

### 第1章: 直感の解体（Paradox / 冒頭30秒以内）
- **役割**: `role: "hook"`
- **要件**:
  - 視聴者の直感・常識と反する不条理な事実を提示する。
  - ナレーションに視聴者への語りかけを含む問い（「〜ではありませんか？」「なぜでしょうか？」）を必須配置。
  - 視覚演出: スポットライト、二項対立カード、シンプルな問いのテキスト。

### 第2章: 構造の解剖（Mechanism / 因果の図解）
- **役割**: `role: "body"` / `role: "recap"`
- **要件**:
  - 一次文献（論文・統計）が提唱する因果関係・数学的モデルを解説する。
  - 専門用語が出る場合は、それ以前に `role: "glossary"` または「〜とは」で定義する。
  - **数値表現（割合・倍率・金額等）には必ず `scene.sources` を付与する**（出典なしの数値はlintでerror）。
  - 視覚演出: プログレッシブバー（`type: "meter"`）、因果フロー図（`type: "flow"`, `motion: "travel"`）。

### 第3章: 具体例と物語（Story）
- **役割**: `role: "example"`（または `beat: "situation"` → `"conflict"` → `"lesson"`）
- **要件**:
  - 架空の身近な例（日常の観察）の場合は `fictional: true` を明記。実例の場合は `sources` を付与。
  - 抽象的な数理モデルが、いかに私たちの生活・職業・選択に関わっているかを実感させる。

### 第4章: 本人の考察（Reflection）
- **役割**: `role: "reflection"`
- **要件**:
  - **タイトル**: `考察：調べて気づいたこと` 等。
  - **ナレーション**: `【本人の考察：未入力】`（固定文字列 `REFLECTION_PLACEHOLDER`）。
  - **cues**: `[{ "text": "【本人の考察：未入力】", "seconds": 10 }]`。
  - **図解**: `type: "flow"`, `items: ["気になったこと", "調べて分かったこと", "自分の考え"]`。
  - ※ エージェントは絶対に代筆せず、このプレースホルダーのまま保存する。

### 第5章: 結びと免責（Epilogue）
- **役割**: `role: "recap"`
- **要件**:
  - 全体の学びを1文で要約し、視聴者に余韻と内省を残す。
  - **結果を保証しない免責**: ナレーションおよび字幕の両方に「効果や結果を保証するものではありません」等の否定表現を含める（lintで必須検査）。

---

## 3. 文体・字幕・演出ルール（安全検査対策）

1. **語り口（会話調）**:
   - 視聴者への語りかけ（「あなた」「私たち」「見ていきましょう」）を含める。
   - 「である・だ」調の多用を避け、丁寧な「です・ます」調を基本とする（硬い文末比率30%以下）。
2. **字幕文字数と尺配分**:
   - 1つのcueのテキストは**最大55文字**。
   - 読上げ速度は**約5.2〜5.8文字/秒**を基準とし、各cueの秒数を設定する。
3. **禁止表現の排除**:
   - 利益保証（必ず儲かる、損しない）、効果保証（確実に成功する、必ず治る）、煽り（一攫千金、誰でも稼げる）は絶対に使用しない。

---

## 4. 制作パイプラインへの受け渡しと修正手順

### 4.1 下書きの適用フロー
1. エージェントが下書きJSONを `fixtures/draft-<topic>.json` に保存。
2. 制作案件に下書きを投入（本人の考察が自動注入される）:
   ```bash
   ./scripts/run src/cli.ts produce script <id> --plan fixtures/draft-<topic>.json --by <エージェント名>
   ```
3. 生成された `outputs/<id>/script-vN.json` とその版ハッシュを確認し、本人の確認（`produce script-review`）へ引き渡す。

### 4.2 本人からの差戻し（reject）時の修正手順
1. 本人が `produce script-review <id> reject --hash <hash> --note <理由> --by <本人の名前>` で差戻した場合、記録された `note` を読み取る。
2. 指摘事項（例: 「第2章の専門用語が難しい」「具体例をもっと身近にしてほしい」「免責の表現が不自然」）を下書きJSONに反映・修正する。
3. 再度 `produce script <id> --plan fixtures/draft-<topic>.json --by <エージェント名>` を実行して新版（`script-v(N+1).json`）を作成し、再確認を依頼する。
