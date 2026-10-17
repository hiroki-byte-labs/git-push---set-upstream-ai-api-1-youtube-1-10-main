---
name: fact-and-rights-check
description: 台本の個々の主張・提示数値と一次文献の1対1対応、および動画で使用する各素材（SVGピクトグラム・フォント・BGM）の商用利用権・ライセンス条件を確認・記録する。「事実確認をして」「出典を照合して」「素材の権利を確認して」と指示されたときに使う。
---

# 出典・事実確認と素材利用権の確認手順（fact-and-rights-check）

正本は `AGENTS.md`、`docs/REFERENCE-STYLE-POLICY.md`、`docs/AUTONOMOUS-DOCUMENTARY-PIPELINE.md`、`tickets/T124.md`。
このSkillは、知的好奇心探究型ドキュメンタリー制作において、台本の個々の主張・提示数値の根拠と、使用素材（SVG、フォント、BGM等）の利用条件を追跡可能に検証・記録する共有手順を定義する。

> [!IMPORTANT]
> このSkillは事実・権利の確認作業を支援するものであり、法的判断や包括的権利を保証するものではありません。不明・疑義がある事項は必ず「未確認」として人にエスカレーションします。

---

## 1. 事実・数値の照合手順（Claim-Source 1対1対応）

知的好奇心動画の説得力は「具体的な数字」と「学術的根拠」に依存します。ハルシネーションや不正確な俗流データの混入を防ぐため、以下のルールを厳守します。

### 1.1 一次資料の優先ルール
- **優先順位**:
  1. 査読付き学術論文（DOI、JSTOR、ScienceDirect等で原本確認可能なもの）
  2. 政府・公的機関の一次統計（総務省、厚労省、OECD、世界銀行等）
  3. 専門学術書・著者自身による解説書
  4. 二次解説記事・ネット要約（※これらは参考情報に留め、数値の根拠出典としては採用しない）

### 1.2 主張・数値の1対1対応表（Claim Matrix）
台本中のすべての「客観的数値」「因果関係の主張」「学説の引用」について、以下の項目を記録する:
1. **主張内容（claim）**: 台本中で語られる具体的な文言。
2. **提示数値（value）**: 0.01%、数千倍、西暦2531年等の具体的な測定・計算値。
3. **出典ID（sourceId）**: 台本の `sources` に登録されたID。
4. **文献名・箇所（citation）**: 論文の著者・発行年・論文名、該当ページまたは節。
5. **確認URL（url）**: 原本または公式アブストラクトのURL（https）。
6. **確認日（checkedAt）**: エージェントが原本存在を確認した日付（ISO）。
7. **判定ステータス（status）**:
   - `verified`: 一次資料の該当箇所と数値・論理が完全に一致している。
   - `inference`: 一次資料の理論モデルを元にした正当な推論・敷衍である。
   - `unverified`: 一次資料での確認が取れていない、または推計前提が曖昧（**※要エスカレーション**）。

---

## 2. 素材利用権の確認手順（Rights Matrix）

画面演出や音響に使用するすべての構成要素について、商用利用可否およびライセンス条件を明文化します。

### 2.1 視覚素材（SVGピクトグラム・図形）
- **自作（original）**:
  - `motion-lab/src/primitives/` に配置された自作SVG（PersonSilhouette, BalanceScale等）。完全商用フリー・帰属不要。
- **外部素材（外部SVG・アイコン）**:
  - パブリックドメイン（CC0）または商用利用許可済みライセンス（Apache 2.0, MIT等）に限定。
  - 帰属表示（Attribution）の要否を確認し、必要な場合は台本メタデータ（概要欄出典リスト）に自動挿入する。

### 2.2 音声素材（ナレーション・BGM・効果音）
- **ナレーション**:
  - TTSエンジンの商用利用規約（商用利用権が含まれるプラン・ライセンスか）。
- **BGM・効果音**:
  - 自作生成音（正弦波・プロシージャルアンビエント）または利用許諾の明確なロイヤリティフリー音源。

### 2.3 フォント
- **システムフォント / オープンソースフォント**:
  - macOS標準システムUIフォント（表示用レンダリングのみ）または SIL Open Font License（Noto Sans JP等）。

---

## 3. 人へのエスカレーション基準（安全停止ルール）

以下のいずれかに該当する場合、エージェントは確認完了（ok=true）と偽らず、**即時に「要確認（escalation）」として処理を停止し、人へ判断を委ねます**:

1. **未確認の数値・主張の存在**:
   - 台本中に登場する具体的な統計数値や格差倍率について、一次文献での裏付けが取れず `status: 'unverified'` が1件でもある場合。
2. **素材ライセンスの不明瞭さ**:
   - 入手元が不明（`origin: 'unknown'`）、または商用利用可否が明記されていない（`commercialUseAllowed: false`）素材が使用されている場合。
3. **論争的知見の断定**:
   - 学術界で定説となっていない仮説が、あたかも確定事実であるかのように台本で断定されている場合。

---

## 4. 成果物仕様

エージェントは事実確認の実施結果を、機械可読なJSONデータ（`src/fact-check.ts` 準拠）および人が確認しやすいMarkdownレポートとして保存します。
制作案件へ渡すときは `docs/FACT-CHECK-APPROVAL.md` に従い、`produce fact-check` の未確認ひな型から現在の案件/台本版のbindingを取得し、実照合したレポートを取り込む。ひな型を自動でverifiedにせず、台本変更後はbindingだけを書き換えて流用しない。以下の汎用schema例には案件bindingがないため、そのまま本番承認用には使えない。

### 4.1 データ形式（`fact-check-report.json`）
```json
{
  "schema": 1,
  "planId": "sample-v2",
  "claims": [
    {
      "claim": "わずか0.01%の実力差が天文学的な所得格差を生む",
      "value": "0.01%",
      "sourceId": "rosen-1981",
      "citation": "Sherwin Rosen (1981) 'The Economics of Superstars', AER p.845",
      "url": "https://www.jstor.org/stable/1803469",
      "status": "verified",
      "checkedAt": "2026-10-12"
    }
  ],
  "assets": [
    {
      "assetId": "person-silhouette-svg",
      "type": "svg",
      "origin": "original",
      "license": "Proprietary / In-house",
      "attributionRequired": false,
      "commercialUseAllowed": true,
      "checkedAt": "2026-10-12"
    }
  ],
  "escalations": [],
  "ok": true
}
```

### 4.2 Markdownレポート形式（`fact-check-report.md`）
- 主張・数値と出典の対応表（テーブル）
- 使用素材の利用権一覧表（テーブル）
- エスカレーション（未確認・要確認事項）一覧
- 総合判定（合格 / 人の判断待ち）
