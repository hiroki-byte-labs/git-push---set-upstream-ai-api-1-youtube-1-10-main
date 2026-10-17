import {createHash} from 'node:crypto';
import {readFileSync, realpathSync} from 'node:fs';
import {resolve, sep} from 'node:path';

export type ThumbnailTypography = {
  family: 'mincho' | 'gothic'; weight: 700 | 800 | 900;
  emphasis?: string[]; outline?: boolean; glow?: boolean; gradient?: boolean;
};
export function validateTypography(raw: unknown, headline: string): ThumbnailTypography {
  const value = raw as ThumbnailTypography;
  if (!value || !['mincho', 'gothic'].includes(value.family) || ![700, 800, 900].includes(value.weight)) throw Error('typographyのfamily/weightが不正');
  for (const key of ['outline', 'glow', 'gradient'] as const) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw Error(`typography.${key}は真偽値`);
  if (value.emphasis !== undefined && (!Array.isArray(value.emphasis) || value.emphasis.length > 3 || value.emphasis.some(t => typeof t !== 'string' || !t.trim() || !headline.includes(t)))) throw Error('typography.emphasisは見出し内の1〜3語');
  return value;
}

export function verifyTypographyFonts(root = 'assets/fonts') {
  const base = realpathSync(root);
  const manifest = JSON.parse(readFileSync(resolve(base, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 1 || !Array.isArray(manifest.fonts) || manifest.fonts.length !== 2) throw Error('フォント台帳が不正');
  for (const item of manifest.fonts) {
    const file = realpathSync(resolve(base, item.file)), license = realpathSync(resolve(base, item.licenseFile));
    if (![file, license].every(f => f.startsWith(base + sep))) throw Error('フォントが台帳ディレクトリ外');
    const hash = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
    if (item.license !== 'OFL-1.1' || hash(file) !== item.sha256 || hash(license) !== item.licenseSha256) throw Error('フォント/ライセンスのSHA-256不一致');
  }
  return manifest as {schema: 1; fonts: {family: string; file: string; sha256: string; licenseFile: string; licenseSha256: string; license: string}[]};
}
