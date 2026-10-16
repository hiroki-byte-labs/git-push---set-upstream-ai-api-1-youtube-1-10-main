import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {checkThumbnails,THUMB_MAX_BYTES} from '../src/thumbnails.ts';
import {buildThumbSpecs} from '../src/timeline.ts';
import {loadPlan,validatePlanV2} from '../src/plan.ts';
import {lintPlan} from '../src/lint.ts';
const v2=()=>loadPlan(JSON.parse(readFileSync('fixtures/sample-v2.json','utf8')));
test('サムネイル仕様（T073）: 3案、既定は題名とpromise、図解はhook以外の最初の場面',()=>{const s=buildThumbSpecs(v2());assert.deepEqual(s.map(x=>x.file),['thumbnail-a.png','thumbnail-b.png','thumbnail-c.png']);assert.equal(s[0].headline,'投資と心理｜判断の前に確かめること');assert.equal(s[0].sub,'判断の前に考え方を確かめる3つの観点');assert.equal(s[0].scene,1);const p=v2();p.thumbnail={headline:'判断の前の3つの確認',scene:4};assert.equal(buildThumbSpecs(p)[1].scene,3)});
test('サムネイルの文言検証と禁止表現（T073）',()=>{const p=JSON.parse(readFileSync('fixtures/sample-v2.json','utf8'));p.thumbnail={headline:'あ'.repeat(21)};assert.throws(()=>validatePlanV2(p),/thumbnail/);p.thumbnail={headline:'見出し',scene:99};assert.throws(()=>validatePlanV2(p),/場面番号/);const q=v2();q.thumbnail={headline:'必ず儲かる判断'};assert.ok(lintPlan(q).findings.some(f=>f.where==='サムネイル'&&f.level==='error'))});
test('サムネイル検査（T073）: サイズ・はみ出し・コントラスト',()=>{const d=mkdtempSync(join(tmpdir(),'th-'));try{writeFileSync(join(d,'a.png'),Buffer.alloc(10));writeFileSync(join(d,'b.png'),Buffer.alloc(THUMB_MAX_BYTES+1));writeFileSync(join(d,'thumbnails-report.json'),JSON.stringify([{file:'a.png',variant:'a',headlineSize:100,fitted:true,contrast:16.2},{file:'b.png',variant:'b',headlineSize:60,fitted:false,contrast:3.1},{file:'c.png',variant:'c',headlineSize:80,fitted:true,contrast:9}]));const r=checkThumbnails(d);assert.equal(r[0].ok,true);assert.equal(r[1].issues.length,3);assert.deepEqual(r[2].issues,['画像がない'])}finally{rmSync(d,{recursive:true,force:true})}});
// T096: 描画に使う最終文言（省略時の題名・promiseへの代替を含む）を、lintでも同じ値で検査する。
const thumbErrors=(p:any)=>lintPlan(p).findings.filter(f=>f.where.startsWith('サムネイル')&&f.level==='error');
test('サムネイル省略時: 題名「必ず儲かる」は構造検証を通るがlintでerror、描画仕様と同じ文言',()=>{const raw=JSON.parse(readFileSync('fixtures/sample-v2.json','utf8'));delete raw.thumbnail;raw.title='必ず儲かる';const p=loadPlan(raw);assert.equal(buildThumbSpecs(p)[0].headline,'必ず儲かる');const e=thumbErrors(p);assert.ok(e.some(f=>f.text==='必ず儲かる'&&f.rule==='guarantee'));assert.equal(lintPlan(p).ok,false)});
test('サムネイル: 補足の省略でpromiseが代替される場合も検査',()=>{const p=v2();p.thumbnail={headline:'判断の前の3つの確認'};p.promise='誰でも稼げる3つの観点';assert.equal(buildThumbSpecs(p)[0].sub,'誰でも稼げる3つの観点');assert.ok(thumbErrors(p).some(f=>f.text==='誰でも稼げる3つの観点'&&f.rule==='hype'))});
test('サムネイル: 明示した文言は代替より優先し、代替値は検査しない',()=>{const p=v2();p.promise='誰でも稼げる3つの観点';p.thumbnail={headline:'判断の前の3つの確認',sub:'記録の観点'};assert.deepEqual([buildThumbSpecs(p)[0].headline,buildThumbSpecs(p)[0].sub],['判断の前の3つの確認','記録の観点']);assert.equal(thumbErrors(p).length,0)});
test('サムネイル: 明示・部分指定・すべて省略の正常例はerrorなし、lintと描画の文言が一致',()=>{
 const cases=[v2(),(()=>{const p=v2();p.thumbnail={headline:'判断の前の3つの確認',sub:'記録の観点'};return p})(),(()=>{const p=v2();p.thumbnail={headline:'判断の前の3つの確認'};return p})(),(()=>{const p=v2();delete p.thumbnail;delete p.promise;return p})()];
 for(const p of cases){assert.equal(thumbErrors(p).length,0);const s=buildThumbSpecs(p)[0];const q={...p,thumbnail:undefined,title:s.headline,promise:'必ず儲かる'};assert.equal(thumbErrors(q).filter(f=>f.text==='必ず儲かる').length,1)}
 const none=cases[3];assert.equal(buildThumbSpecs(none)[0].sub,'');
});

// T165: 実画像・全テキスト・寸法・欠測・NaN/Infinity拒否・判定契約
import {checkThumbnailQuality, readPngDimensions} from '../src/thumbnails.ts';
import {convertPlanThumbnailToBrief} from '../src/thumbnail-brief.ts';

function createMockPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(32);
  // PNG signature
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
  buf[4] = 0x0d; buf[5] = 0x0a; buf[6] = 0x1a; buf[7] = 0x0a;
  // IHDR length: 13
  buf.writeUInt32BE(13, 8);
  // 'IHDR'
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

test('PNGヘッダーの寸法読み取り（T165）: 正しい寸法と破損データを判定', () => {
  const valid = createMockPng(1280, 720);
  assert.deepEqual(readPngDimensions(valid), {width: 1280, height: 720});
  assert.equal(readPngDimensions(Buffer.alloc(10)), null);
  assert.equal(readPngDimensions(Buffer.from('not a png file at all!')), null);
});

test('厳格なサムネイル品質検査（T165）: 正常系・寸法違い・欠測/NaN・破損PNG・判定契約', () => {
  const d = mkdtempSync(join(tmpdir(), 'th-quality-'));
  try {
    const validPng = createMockPng(1280, 720);
    const wrongSizePng = createMockPng(800, 600);
    const corruptPng = Buffer.from('corrupted');

    writeFileSync(join(d, 'thumbnail-a.png'), validPng);
    writeFileSync(join(d, 'thumbnail-b.png'), wrongSizePng);
    writeFileSync(join(d, 'thumbnail-c.png'), corruptPng);

    // 1. 欠測・NaN・空レコードを含む異常レポート
    writeFileSync(join(d, 'thumbnails-report.json'), JSON.stringify([
      {file: 'thumbnail-a.png', variant: 'a', headlineSize: 80, fitted: true, contrast: 9.5},
      {file: 'thumbnail-b.png', variant: 'b', headlineSize: NaN, fitted: true, contrast: 7.0},
      {file: 'thumbnail-c.png', variant: 'c', headlineSize: 60, fitted: false, contrast: 3.2},
    ]));

    const brief = convertPlanThumbnailToBrief(v2());
    const res = checkThumbnailQuality(d, brief, {selectedThumbnail: 'thumbnail-a.png'});

    // 候補aは寸法1280x720、contrast9.5で合格
    assert.equal(res.candidates[0].status, 'pass');
    // 候補bは寸法不一致とNaNで不合格
    assert.equal(res.candidates[1].status, 'fail');
    assert.ok(res.candidates[1].issues.some(i => i.includes('画像寸法') || i.includes('測定値が不正')));
    // 候補cは破損PNG、低コントラスト、はみ出しで不合格
    assert.equal(res.candidates[2].status, 'fail');
    assert.ok(res.candidates[2].issues.some(i => i.includes('破損')));

    // 採用がaなので進行可能
    assert.equal(res.canProceed, true);
    // 全体合格ではない
    assert.equal(res.ok, false);

    // 採用をbにすると進行不可で停止
    const resB = checkThumbnailQuality(d, brief, {selectedThumbnail: 'thumbnail-b.png'});
    assert.equal(resB.canProceed, false);
    assert.equal(resB.selectedOk, false);
    assert.ok(resB.reasons.some(r => r.includes('不合格')));
  } finally {
    rmSync(d, {recursive: true, force: true});
  }
});

// T173: モバイル・超縮小表示における文字領域コントラスト・エッジ明瞭度自動測定と品質ゲート拡充
import {deflateSync} from 'node:zlib';
import {measureScaledLegibility, MIN_SCALED_CONTRAST, MIN_SCALED_EDGE} from '../src/thumbnails.ts';

function createFullPng(width: number, height: number, getPixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const bpp = 4;
  const stride = width * bpp;
  const raw = Buffer.alloc(height * (1 + stride));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }
  const idat = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  function chunk(type: string, data: Buffer) {
    const c = Buffer.alloc(12 + data.length);
    c.writeUInt32BE(data.length, 0);
    c.write(type, 4, 'ascii');
    data.copy(c, 8);
    return c;
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

test('縮小画像の文字領域コントラスト・エッジ維持率測定（T173）: 正常・低コントラスト・文字線消失', () => {
  // 1. 正常系（黒背景に白文字ストライプ、明確なエッジ）
  const goodPng = createFullPng(160, 90, (x, y) => {
    if (x >= 20 && x <= 80 && y >= 20 && y <= 40 && (x % 6 < 3)) {
      return [255, 255, 255, 255];
    }
    return [14, 20, 30, 255];
  });
  const resGood = measureScaledLegibility(goodPng, undefined, 18.0);
  assert.equal(resGood.legible, true);
  assert.ok(resGood.contrast >= MIN_SCALED_CONTRAST);
  assert.ok(resGood.topEdge >= MIN_SCALED_EDGE);
  assert.equal(resGood.issues.length, 0);

  // 2. 低コントラスト埋没（背景とほぼ同色の文字）
  const lowContrastPng = createFullPng(160, 90, (x, y) => {
    if (x >= 20 && x <= 80 && y >= 20 && y <= 40 && (x % 6 < 3)) {
      return [28, 38, 54, 255]; // 低コントラスト
    }
    return [14, 20, 30, 255];
  });
  const resLow = measureScaledLegibility(lowContrastPng, undefined, 18.0);
  assert.equal(resLow.legible, false);
  assert.ok(resLow.contrast < MIN_SCALED_CONTRAST);
  assert.ok(resLow.issues.some(i => i.includes('3未満') || i.includes('3.00未満') || i.includes('埋没')));

  // 3. 文字線消失・ベタ塗り平坦（エッジなし）
  const flatPng = createFullPng(160, 90, () => [255, 255, 255, 255]);
  const resFlat = measureScaledLegibility(flatPng, undefined, 18.0);
  assert.equal(resFlat.legible, false);
  assert.ok(resFlat.topEdge < MIN_SCALED_EDGE);
  assert.ok(resFlat.issues.some(i => i.includes('文字線エッジ強度') || i.includes('文字潰れ')));
});

test('縮小表示品質検査ゲートとレポート追記（T173）: checkThumbnailQuality での検出と自動更新', () => {
  const d = mkdtempSync(join(tmpdir(), 'th-scaled-'));
  try {
    const validPng = createMockPng(1280, 720);
    // 正常な160x90縮小画像
    const good160 = createFullPng(160, 90, (x, y) => {
      if (x >= 20 && x <= 80 && y >= 20 && y <= 40 && (x % 6 < 3)) {
        return [255, 255, 255, 255];
      }
      return [14, 20, 30, 255];
    });
    // 低コントラスト埋没の160x90縮小画像
    const low160 = createFullPng(160, 90, (x, y) => {
      if (x >= 20 && x <= 80 && y >= 20 && y <= 40 && (x % 6 < 3)) {
        return [28, 38, 54, 255];
      }
      return [14, 20, 30, 255];
    });

    writeFileSync(join(d, 'thumbnail-a.png'), validPng);
    writeFileSync(join(d, 'thumbnail-a-160.png'), good160);

    writeFileSync(join(d, 'thumbnail-b.png'), validPng);
    writeFileSync(join(d, 'thumbnail-b-160.png'), low160);

    const reportData = [
      {file: 'thumbnail-a.png', variant: 'a', headlineSize: 80, fitted: true, contrast: 18.0, drawnBox: {x: 80, y: 398, width: 504, height: 84}},
      {file: 'thumbnail-b.png', variant: 'b', headlineSize: 80, fitted: true, contrast: 18.0, drawnBox: {x: 80, y: 398, width: 504, height: 84}},
    ];
    writeFileSync(join(d, 'thumbnails-report.json'), JSON.stringify(reportData, null, 2));

    const brief = convertPlanThumbnailToBrief(v2());
    const res = checkThumbnailQuality(d, brief, {selectedThumbnail: 'thumbnail-a.png'});

    // 候補aは縮小視認性合格
    assert.equal(res.candidates[0].status, 'pass');
    assert.ok(res.candidates[0].scaledLegibility);
    assert.equal(res.candidates[0].scaledLegibility.legible, true);

    // 候補bは縮小コントラスト比不足で不合格
    assert.equal(res.candidates[1].status, 'fail');
    assert.ok(res.candidates[1].scaledLegibility);
    assert.equal(res.candidates[1].scaledLegibility.legible, false);
    assert.ok(res.candidates[1].issues.some(i => i.includes('縮小表示') && i.includes('コントラスト比')));

    // レポートに scaledLegibility が追記・保存されていること
    const updatedReport = JSON.parse(readFileSync(join(d, 'thumbnails-report.json'), 'utf8'));
    assert.ok(updatedReport[0].scaledLegibility);
    assert.equal(updatedReport[0].scaledLegibility.width, 160);
    assert.equal(updatedReport[0].scaledLegibility.height, 90);
    assert.ok(updatedReport[0].scaledLegibility.contrast > 0);
  } finally {
    rmSync(d, {recursive: true, force: true});
  }
});

