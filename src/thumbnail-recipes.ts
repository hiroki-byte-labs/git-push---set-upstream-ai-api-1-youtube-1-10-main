// 題材固有の自作サムネイルモチーフと構図レシピ（T162）
// 格差・名字・月の3題材を表す自作オリジナル素材台帳と、構図レイアウトレシピを定義する。
import {existsSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import type {ThumbnailComposition} from './thumbnail-brief.ts';

export type OriginalAssetInfo = {
  assetId: string;
  relativePath: string;
  sha256: string;
  rightsBasis: string;
  author: string;
  verifiedDate: string;
  description: string;
  topic: string;
};

// 自作オリジナル素材台帳
export const THUMBNAIL_ORIGINAL_ASSETS: Record<string, OriginalAssetInfo> = {
  'asset:person-solo': {
    assetId: 'asset:person-solo',
    relativePath: 'assets/thumbnail-originals/person-solo.svg',
    sha256: '1eab09eb2da933e1860e092821607b33a329fab57d89543d77a05d0f1615aab9',
    rightsBasis: 'self-made (T145/T162 in-house contour)',
    author: 'Project In-house',
    verifiedDate: '2026-10-16',
    description: '単独の人物シルエット。1位・注目を集める一人・孤独な個人の象徴',
    topic: '格差・スーパースター経済学',
  },
  'asset:crowd-silhouette': {
    assetId: 'asset:crowd-silhouette',
    relativePath: 'assets/thumbnail-originals/crowd-silhouette.svg',
    sha256: '6026ebbabd30355899c22cd8b980f21b9cdbf5fef2ad2c713c1cedffd6e20bce',
    rightsBasis: 'self-made (T162 in-house geometry)',
    author: 'Project In-house',
    verifiedDate: '2026-10-16',
    description: '多数の人々・群衆・市場の聴衆を表す自作シルエット',
    topic: '格差・スーパースター経済学',
  },
  'asset:branching-tree': {
    assetId: 'asset:branching-tree',
    relativePath: 'assets/thumbnail-originals/branching-tree.svg',
    sha256: '9785ce315feee03d389a0bb76137d66d4afb61b0ff0459debc8da85c6e8c59bd',
    rightsBasis: 'self-made (T162 in-house geometry)',
    author: 'Project In-house',
    verifiedDate: '2026-10-16',
    description: '家系の分岐と途絶（バツ印）・残存の集中を表す確率ツリー図',
    topic: '名字絶滅・分枝過程',
  },
  'asset:convergence-arrow': {
    assetId: 'asset:convergence-arrow',
    relativePath: 'assets/thumbnail-originals/convergence-arrow.svg',
    sha256: '66ba5d5daac393b487be35efbeed681e2bc72f725ef8a0736e678817d55bf115',
    rightsBasis: 'self-made (T162 in-house geometry)',
    author: 'Project In-house',
    verifiedDate: '2026-10-16',
    description: '多数の選択肢・枝が単一の巨大な集約先へ収束していく矢印図形',
    topic: '名字絶滅・収束',
  },
  'asset:moon-glow': {
    assetId: 'asset:moon-glow',
    relativePath: 'assets/thumbnail-originals/moon-glow.svg',
    sha256: '6ec8c6f1433d66338a661d75503b1a3d518bd80854c570bcdf86ef1fb524e4c1',
    rightsBasis: 'self-made (T162 in-house geometry)',
    author: 'Project In-house',
    verifiedDate: '2026-10-16',
    description: '夜空に輝く大きな月の自作グラデーション幾何図形',
    topic: '月とスマホ・知覚の食い違い',
  },
  'asset:smartphone-frame': {
    assetId: 'asset:smartphone-frame',
    relativePath: 'assets/thumbnail-originals/smartphone-frame.svg',
    sha256: 'a557db78db7a9e03a1d17894d4e6a40bb21df81b5d561740b81deecf3fe78524',
    rightsBasis: 'self-made (T162 in-house geometry)',
    author: 'Project In-house',
    verifiedDate: '2026-10-16',
    description: 'スマホ画面枠と、その画面内に小さく写る月の自作幾何図形',
    topic: '月とスマホ・観測装置',
  },
};

// 素材台帳のファイル実在とハッシュ整合性を検証する
export function verifyThumbnailAssets(baseDir: string = process.cwd()): {ok: boolean; errors: string[]} {
  const errors: string[] = [];
  for (const [id, meta] of Object.entries(THUMBNAIL_ORIGINAL_ASSETS)) {
    const fullPath = join(baseDir, meta.relativePath);
    if (!existsSync(fullPath)) {
      errors.push(`素材ファイルが存在しません: ${meta.relativePath} (${id})`);
      continue;
    }
    const content = readFileSync(fullPath);
    const hash = createHash('sha256').update(content).digest('hex');
    if (hash !== meta.sha256) {
      errors.push(`ハッシュ不一致 (${id}): 期待値=${meta.sha256}, 実測=${hash}`);
    }
  }
  return {ok: errors.length === 0, errors};
}

// レイアウト領域定義（1280x720基準）
export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ThumbnailRecipe = {
  composition: ThumbnailComposition;
  backgroundTheme: 'dark' | 'light';
  backgroundColor: string;
  textColor: string;
  subTextColor: string;
  accentColor: string;
  headlineArea: LayoutRect & {fontSize: number; maxLines: number; align: 'left' | 'center'};
  subArea: LayoutRect & {fontSize: number; align: 'left' | 'center'};
  visualArea: LayoutRect;
  visualAlignment: 'left' | 'right' | 'center' | 'split';
};

// 構図別レイアウトレシピ
export const THUMBNAIL_RECIPES: Record<string, ThumbnailRecipe> = {
  // 対比型: 左右分割構図（暗背景）
  'contrast-dark': {
    composition: 'contrast',
    backgroundTheme: 'dark',
    backgroundColor: '#0f141c',
    textColor: '#ffffff',
    subTextColor: '#9bb3c8',
    accentColor: '#e05a47',
    headlineArea: {x: 80, y: 70, width: 1120, height: 110, fontSize: 68, maxLines: 1, align: 'center'},
    subArea: {x: 120, y: 190, width: 1040, height: 50, fontSize: 32, align: 'center'},
    visualArea: {x: 80, y: 260, width: 1120, height: 400},
    visualAlignment: 'split',
  },
  // 象徴型: 単一モチーフ中心構図（左見出し・右モチーフ・暗背景）
  'symbol-dark': {
    composition: 'symbol',
    backgroundTheme: 'dark',
    backgroundColor: '#0c1017',
    textColor: '#ffffff',
    subTextColor: '#b0c4de',
    accentColor: '#4ea8de',
    headlineArea: {x: 90, y: 220, width: 620, height: 260, fontSize: 76, maxLines: 2, align: 'left'},
    subArea: {x: 90, y: 500, width: 620, height: 60, fontSize: 32, align: 'left'},
    visualArea: {x: 740, y: 120, width: 450, height: 500},
    visualAlignment: 'right',
  },
  // 関係・因果型: メカニズム構図（上見出し・下部ツリー/関係図・暗背景）
  'relationship-dark': {
    composition: 'relationship',
    backgroundTheme: 'dark',
    backgroundColor: '#111722',
    textColor: '#ffffff',
    subTextColor: '#a0aec0',
    accentColor: '#ed8936',
    headlineArea: {x: 80, y: 60, width: 1120, height: 100, fontSize: 64, maxLines: 1, align: 'left'},
    subArea: {x: 80, y: 170, width: 1120, height: 50, fontSize: 30, align: 'left'},
    visualArea: {x: 140, y: 240, width: 1000, height: 420},
    visualAlignment: 'center',
  },
  // 情景型: 明るい生成り背景の構図（S06等で観察された明色）
  'scene-light': {
    composition: 'scene',
    backgroundTheme: 'light',
    backgroundColor: '#f5f3ec',
    textColor: '#1a1f2c',
    subTextColor: '#4a5568',
    accentColor: '#c53030',
    headlineArea: {x: 80, y: 200, width: 640, height: 260, fontSize: 74, maxLines: 2, align: 'left'},
    subArea: {x: 80, y: 480, width: 640, height: 60, fontSize: 32, align: 'left'},
    visualArea: {x: 750, y: 120, width: 450, height: 500},
    visualAlignment: 'right',
  },
};

// プレビューSVGの生成（1280x720基準）
// 原寸表示および320x180/160x90縮小表示での目視確認用
export function renderRecipePreviewSvg(
  recipeKey: keyof typeof THUMBNAIL_RECIPES,
  headline: string,
  sub: string,
  assetSnippet: string
): string {
  const recipe = THUMBNAIL_RECIPES[recipeKey];
  if (!recipe) throw Error(`未知のレシピ: ${recipeKey}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <!-- 背景 -->
  <rect width="1280" height="720" fill="${recipe.backgroundColor}"/>
  
  <!-- 図像・モチーフ領域 -->
  <g transform="translate(${recipe.visualArea.x}, ${recipe.visualArea.y})">
    ${assetSnippet}
  </g>

  <!-- 主見出し -->
  <text x="${recipe.headlineArea.align === 'center' ? recipe.headlineArea.x + recipe.headlineArea.width / 2 : recipe.headlineArea.x}"
        y="${recipe.headlineArea.y + recipe.headlineArea.fontSize}"
        font-family="'Hiragino Mincho ProN', 'Yu Mincho', serif"
        font-size="${recipe.headlineArea.fontSize}"
        font-weight="bold"
        fill="${recipe.textColor}"
        text-anchor="${recipe.headlineArea.align === 'center' ? 'middle' : 'start'}">
    ${headline}
  </text>

  <!-- 補足見出し -->
  ${sub ? `<text x="${recipe.subArea.align === 'center' ? recipe.subArea.x + recipe.subArea.width / 2 : recipe.subArea.x}"
        y="${recipe.subArea.y + recipe.subArea.fontSize}"
        font-family="'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif"
        font-size="${recipe.subArea.fontSize}"
        fill="${recipe.subTextColor}"
        text-anchor="${recipe.subArea.align === 'center' ? 'middle' : 'start'}">
    ${sub}
  </text>` : ''}
</svg>`;
}
