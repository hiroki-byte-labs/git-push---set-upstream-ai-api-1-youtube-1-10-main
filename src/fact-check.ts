// 出典・事実確認と素材利用権の確認（T124）。
// 主張・提示数値と出典の1対1対応、視覚・音声・フォント素材の利用許諾確認、未確認・不明時のエスカレーション。
// Skill・検査は確認作業を支援するものであり、法的判断や権利を保証しない。

export type ClaimStatus = 'verified' | 'unverified' | 'inference';
export type AssetType = 'svg' | 'font' | 'audio' | 'image';
export type AssetOrigin = 'original' | 'cc0' | 'commercial-free' | 'licensed' | 'unknown';

export type ClaimRecord = {
  claim: string;
  value?: string;
  sourceId: string;
  citation: string;
  url: string;
  status: ClaimStatus;
  checkedAt: string;
  note?: string;
};

export type AssetRightRecord = {
  assetId: string;
  type: AssetType;
  origin: AssetOrigin;
  license: string;
  attributionRequired: boolean;
  commercialUseAllowed: boolean;
  checkedAt: string;
  notes?: string;
};

export type FactCheckReport = {
  schema: 1;
  planId: string;
  claims: ClaimRecord[];
  assets: AssetRightRecord[];
  escalations: string[];
  ok: boolean;
};

const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function validateClaim(c: any, index: number): ClaimRecord {
  if (!c || typeof c !== 'object') throw Error(`主張[${index}]: オブジェクトが必要`);
  if (!isNonEmpty(c.claim)) throw Error(`主張[${index}]: claim（主張内容）が必要`);
  if (!isNonEmpty(c.sourceId)) throw Error(`主張[${index}]: sourceIdが必要`);
  if (!isNonEmpty(c.citation)) throw Error(`主張[${index}]: citation（文献名・箇所）が必要`);
  if (!isNonEmpty(c.url) || !/^https?:\/\/\S+$/.test(c.url)) throw Error(`主張[${index}]: 有効なURLが必要`);
  if (!['verified', 'unverified', 'inference'].includes(c.status)) throw Error(`主張[${index}]: statusはverified/unverified/inference`);
  if (!isNonEmpty(c.checkedAt) || Number.isNaN(Date.parse(c.checkedAt))) throw Error(`主張[${index}]: checkedAt（ISO日付）が必要`);

  return {
    claim: c.claim,
    ...(c.value ? {value: String(c.value)} : {}),
    sourceId: c.sourceId,
    citation: c.citation,
    url: c.url,
    status: c.status,
    checkedAt: c.checkedAt,
    ...(c.note ? {note: String(c.note)} : {}),
  };
}

export function validateAssetRight(a: any, index: number): AssetRightRecord {
  if (!a || typeof a !== 'object') throw Error(`素材[${index}]: オブジェクトが必要`);
  if (!isNonEmpty(a.assetId)) throw Error(`素材[${index}]: assetIdが必要`);
  if (!['svg', 'font', 'audio', 'image'].includes(a.type)) throw Error(`素材[${index}]: typeはsvg/font/audio/image`);
  if (!['original', 'cc0', 'commercial-free', 'licensed', 'unknown'].includes(a.origin)) throw Error(`素材[${index}]: originが不正`);
  if (!isNonEmpty(a.license)) throw Error(`素材[${index}]: licenseが必要`);
  if (typeof a.attributionRequired !== 'boolean') throw Error(`素材[${index}]: attributionRequired（真偽値）が必要`);
  if (typeof a.commercialUseAllowed !== 'boolean') throw Error(`素材[${index}]: commercialUseAllowed（真偽値）が必要`);
  if (!isNonEmpty(a.checkedAt) || Number.isNaN(Date.parse(a.checkedAt))) throw Error(`素材[${index}]: checkedAt（ISO日付）が必要`);

  return {
    assetId: a.assetId,
    type: a.type,
    origin: a.origin,
    license: a.license,
    attributionRequired: a.attributionRequired,
    commercialUseAllowed: a.commercialUseAllowed,
    checkedAt: a.checkedAt,
    ...(a.notes ? {notes: String(a.notes)} : {}),
  };
}

export function checkFactAndRights(raw: any): FactCheckReport {
  if (!raw || raw.schema !== 1) throw Error('レポートのschemaは1が必要');
  if (!isNonEmpty(raw.planId)) throw Error('planIdが必要');
  if (!Array.isArray(raw.claims) || !raw.claims.length) throw Error('claims（1件以上の主張確認）が必要');
  if (!Array.isArray(raw.assets) || !raw.assets.length) throw Error('assets（1件以上の素材権利確認）が必要');

  const claims = raw.claims.map((c: any, i: number) => validateClaim(c, i));
  const assets = raw.assets.map((a: any, i: number) => validateAssetRight(a, i));

  const escalations: string[] = [];

  // 未確認の主張があればエスカレーション
  for (const c of claims) {
    if (c.status === 'unverified') {
      escalations.push(`未確認の主張: 「${c.claim}」（出典未照合または要調査）`);
    }
  }

  // 商用利用不可または権利元不明の素材があればエスカレーション
  for (const a of assets) {
    if (a.origin === 'unknown' || !a.commercialUseAllowed) {
      escalations.push(`素材利用権の要確認: 「${a.assetId}」（ライセンス: ${a.license}, 商用利用可否: ${a.commercialUseAllowed}）`);
    }
  }

  const ok = escalations.length === 0;

  return {
    schema: 1,
    planId: raw.planId,
    claims,
    assets,
    escalations,
    ok,
  };
}
