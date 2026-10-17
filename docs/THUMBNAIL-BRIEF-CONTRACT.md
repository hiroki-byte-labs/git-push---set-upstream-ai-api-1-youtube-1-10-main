# サムネイル観察台帳と生成Briefの契約仕様（T160）

2026-10-16 / T160 / Antigravity（Gemini 3.8 Flash）。
本文書は、公開サムネイル画像の観察台帳（`thumbnail-observation@1`）と、自作動画サムネイルの制作指示書（`thumbnail-brief@1`）のデータ構造、検証契約、入力ハッシュ定義、およびスキーマ更新規則を規定する。

---

## 1. 目的と分離の原則

1. **観察台帳と制作素材の分離**:
   - YouTube等の公開ページで観察された画像URL・画像ハッシュ・目視所見は、現状の市場傾向を把握するための参照記録（`thumbnail-observation@1`）であり、商用再利用や制作利用の許可を意味しない。
   - 制作側（`thumbnail-brief@1`）の素材（`assetId`）として、観察台帳の画像URL（`https://...`、`*.ytimg.com`等）を直接または自動変換で渡すことは固く禁止する（著作権法および制作規約違反）。
2. **決定論的な入力と後続の共通基盤**:
   - 台本（`Plan`）からサムネイル生成に必要な要素（タイトル、約束文、旧thumbnail設定、場面見出し、図解種別、出典）を一意に抽出し、`inputHash`（SHA-256）として固定する。
   - 後続の自動構成（T161）、自作モチーフ台帳（T162）、専用PNG描画（T163）、検査・停止判定（T165）がすべて同一のbrief契約を入力とする。

---

## 2. スキーマ定義

### 2.1 観察台帳スキーマ: `thumbnail-observation@1`
実装: `src/thumbnail-brief.ts`（`validateObservationLedger`）

```typescript
type ThumbnailObservationLedger = {
  schema: 'thumbnail-observation@1';
  observedDate: string;               // YYYY-MM-DD
  timezone: string;                   // 例: 'Asia/Tokyo'
  channelUrl: string;                 // 観察対象チャンネルURL
  selection: string;                  // 標本抽出方法・範囲の説明
  sampleCount: number;                // 標本件数
  method: string;                     // 観察・目視手法
  limits: string[];                   // 限界・不明事項の明記
  samples: ObservationSample[];       // 標本配列
};

type ObservationSample = {
  sampleId: string;                   // 'S01'〜
  videoId: string;                    // YouTube動画ID
  videoUrl: string;                   // 動画URL
  topic: string;                      // 題材
  mainTextObserved: string;           // 目視された主見出し（OCR全文ではない）
  mainTextCharacters: number;         // 文字数
  observation: string;                // 構図・要素・配色の観察所見
  familyInterpretation: string;       // 観察者の解釈（contrast, symbol, collage等）
  backgroundClassification: string;   // 背景分類（dark, light等）
  confidence: string;                 // 信頼度（例: 'manual-visual'）
  thumbnailUrl: string;               // 公開画像URL（制作素材利用不可）
  sha256: string;                     // 画像ファイルのSHA-256
  bytes: number;                      // バイト数
  contentType: string;                // 例: 'image/avif', 'image/jpeg'
};
```

### 2.2 生成Briefスキーマ: `thumbnail-brief@1`
実装: `src/thumbnail-brief.ts`（`validateThumbnailBrief`）

```typescript
type ThumbnailBrief = {
  schema: 'thumbnail-brief@1';
  planId: string;                     // 対象Planのid
  inputHash: string;                  // 入力PlanのSHA-256（64桁hex）
  candidates: ThumbnailCandidate[];   // ちょうど3候補（'a', 'b', 'c'）
  overallStatus: 'ready' | 'needs-review'; // 全体判定
  unknowns?: string[];                // 全体の未確認事項
  createdAt?: string;                 // 作成日時（ISO-8601）
};

type ThumbnailCandidate = {
  id: string;                         // 候補識別子（'a' | 'b' | 'c'）
  headline: string;                   // 主見出し（1〜20字、LIMITS.thumbHeadline）
  sub?: string;                       // 補足見出し（最大30字、LIMITS.thumbSub）
  composition: ThumbnailComposition;  // 'contrast' | 'symbol' | 'scene' | 'relationship'
  motifs: string[];                   // モチーフ識別子（例: ['person-single', 'crowd']）
  grounding: ThumbnailGrounding;      // 場面・出典の根拠
  assets: ThumbnailAssetRef[];        // 制作素材一覧
  reason: string;                     // 構図・文言の選定理由
  unknowns?: string[];                // 候補固有の未確認事項
  status?: 'ready' | 'needs-review';  // 候補の状態
  tone?: 'dark' | 'light';            // 背景の明暗（任意、既定dark。2026-10-17 T163追加。見出しの語句から推測しない）
};

type ThumbnailComposition = 'contrast' | 'symbol' | 'scene' | 'relationship';

type ThumbnailGrounding = {
  sceneIndex?: number;                // 1始まりの場面番号（1〜plan.scenes.length）
  sceneTitle?: string;                // 場面の見出し
  sourceIds?: string[];               // 参照する出典id（plan.sourcesに存在すること）
};

type ThumbnailAssetRef = {
  assetId: string;                    // 自作・許諾済み素材識別子（URL形式不可）
  rightsBasis: string;                // 権利根拠（'self-made', 'public-domain' 等）
  license?: string;                   // ライセンス名
  sourceReference?: string;           // 素材元ファイルパス等
};
```

---

## 3. 入力ハッシュ（inputHash）の定義と計算

入力の決定性を保証するため、`calculatePlanThumbnailInputHash(plan: Plan)` は以下の正規化JSONのSHA-256ダイジェストを算出する。

### 3.1 含まれる項目
1. `planId`: 台本ID
2. `title`: 台本題名
3. `promise`: 約束文（未指定時は空文字）
4. `thumbnail`:
   - `headline`, `sub`, `scene`, `keyword`, `contrast`
5. `scenes`: 各場面の番号（1始まり）、`title`、`role`、`diagramType`、およびソートされた`sources`
6. `sources`: ソートされた出典一覧（`id`, `title`）

### 3.2 含まれない項目
- 画面演出のタイミングやナレーションの秒数微調整
- 作成日時や環境依存メタデータ

これにより、同じ台本からは常に完全に一致する64桁hexの`inputHash`が得られ、不正な改変や別台本への流用を`validateThumbnailBrief`で検出・拒否できる。

---

## 4. 未確認事項（unknowns）と needs-review の規約

- **成功値への暗黙変換の禁止**:
  - `unknowns`（未確認事項）が存在する候補は、`status` を `'ready'` に設定してはならず、必ず `'needs-review'` としなければならない。
  - いずれかの候補に未確認事項がある、または candidate.status が `'needs-review'` である場合、brief全体の `overallStatus` も `'needs-review'` でなければならない（`'ready'` は拒否される）。
- **具体例**:
  - 縮小表示時の文字潰れリスクが未検証の場合
  - 参照する自作モチーフの権利根拠が未確定の場合
  - 場面根拠の出典が未確認の場合

---

## 5. 旧 Plan.thumbnail との後方互換性

既存の `Plan.thumbnail`（T073/T096/T106）で作成された台本は、`convertPlanThumbnailToBrief(plan)` によって自動的に `ThumbnailBrief` へ変換できる。

- **文言解決**:
  - `thumbnailText(plan)` を使用し、`headline` 省略時は `title`、`sub` 省略時は `promise`、未指定時は空文字となる挙動を維持する。
- **3候補の既定構成**:
  - `a`: 象徴型（`symbol`）。主見出し・キーワード中心。
  - `b`: 図解連動型（`relationship` または `scene`）。対象場面の図解と連動。
  - `c`: 対比型（`contrast`）。`contrast` 指定の反映または高コントラスト配色。
- **アセット識別子**:
  - 組み込み素材識別子（`builtin:symbol-focus`, `builtin:diagram-generic`, `builtin:contrast-split`）を使用し、`rightsBasis: 'self-made'` とする。

---

## 6. スキーマ更新規則（Schema Versioning Policy）

1. **命名規則**:
   - `<name>@<major_version>`（例: `thumbnail-brief@1`, `thumbnail-observation@1`）。
2. **後方互換な変更（マイナー改定）**:
   - 既存フィールドの型を狭めず、任意項目（オプショナルフィールド）を追加する場合。
   - メジャーバージョンは変更せず、同一スキーマ名内で許容する。
3. **破壊的変更（メジャー改定）**:
   - 必須項目の追加、既存項目の削除・型変更、許容値（`composition` 等）の削除。
   - スキーマ名を `thumbnail-brief@2` 等にインクリメントし、旧バージョンの変換関数を用意する。
4. **廃止方針**:
   - 旧スキーマは最低1マイレージ期間（M4からM5等）互換変換を維持する。
