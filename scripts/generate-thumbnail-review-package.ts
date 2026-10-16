// 3題材の実サムネイル比較パッケージ生成スクリプト（T167）
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {buildThumbnailCandidates} from '../src/thumbnail-candidates.ts';
import {renderThumbnails} from '../src/thumbnail-renderer.ts';
import {checkThumbnailQuality} from '../src/thumbnails.ts';
import {loadPlan} from '../src/plan.ts';
import type {Plan} from '../src/plan.ts';

const OUT_DIR = resolve('work/thumbnail-evaluation-package');

type TopicItem = {
  key: string;
  name: string;
  fixture: string;
  description: string;
};

const TOPICS: TopicItem[] = [
  {
    key: 'superstar',
    name: '能力格差（スーパースターの経済学）',
    fixture: 'fixtures/sample-superstar-illustration.json',
    description: 'わずかな能力差がテクノロジーや市場規模によって指数関数的な報酬格差へと拡大する現象',
  },
  {
    key: 'surname',
    name: '名字の収縮（数学的姓氏モデル）',
    fixture: 'fixtures/sample-surname-illustration.json',
    description: '夫婦同姓制度と確率過程によって何百年後に1つの名字へと集約していく不可逆な分岐・統合のメカニズム',
  },
  {
    key: 'tolerance',
    name: '不寛容のパラドックス（観測装置と月）',
    fixture: 'fixtures/sample-tolerance-illustration.json',
    description: '多様性と自由を維持するために不寛容な思想をどこまで許容できるかという哲学的境界の探求',
  },
];

export async function generateReviewPackage() {
  mkdirSync(OUT_DIR, {recursive: true});

  const topicResults: any[] = [];

  for (const topic of TOPICS) {
    const raw = JSON.parse(readFileSync(topic.fixture, 'utf8'));
    const plan = loadPlan(raw);
    const brief = buildThumbnailCandidates(plan);

    const topicDir = join(OUT_DIR, topic.key);
    mkdirSync(topicDir, {recursive: true});

    writeFileSync(join(topicDir, 'thumbnail-brief.json'), JSON.stringify(brief, null, 2), 'utf8');

    // 専用描画実行
    const reports = renderThumbnails({brief, outputDir: topicDir});
    const quality = checkThumbnailQuality(topicDir, brief, {selectedThumbnail: 'thumbnail-a.png'});

    topicResults.push({
      topic,
      plan,
      brief,
      reports,
      quality,
    });
  }

  // HTML比較プレビュー生成
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>サムネイル3題材実物比較レビューパッケージ（T167）</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif; background: #0f172a; color: #f1f5f9; margin: 0; padding: 24px; }
  h1 { font-size: 24px; border-bottom: 2px solid #334155; padding-bottom: 8px; color: #38bdf8; }
  h2 { font-size: 20px; margin-top: 32px; color: #94a3b8; border-left: 4px solid #38bdf8; padding-left: 12px; }
  .desc { color: #94a3b8; font-size: 14px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
  .card { background: #1e293b; border-radius: 8px; padding: 16px; border: 1px solid #334155; }
  .card.selected { border: 2px solid #38bdf8; }
  .card-header { font-weight: bold; font-size: 16px; margin-bottom: 8px; display: flex; justify-content: space-between; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #334155; color: #38bdf8; }
  .badge.pass { background: #065f46; color: #34d399; }
  .meta-table { width: 100%; font-size: 12px; border-collapse: collapse; margin-bottom: 12px; }
  .meta-table td { padding: 4px; border-bottom: 1px solid #334155; }
  .meta-table td:first-child { color: #94a3b8; width: 30%; }
  .preview-box { margin-bottom: 16px; text-align: center; }
  .preview-label { font-size: 11px; color: #64748b; margin-bottom: 4px; text-align: left; }
  img.full { width: 100%; height: auto; border-radius: 4px; border: 1px solid #475569; }
  img.mid { width: 320px; height: 180px; border-radius: 4px; border: 1px solid #475569; }
  img.small { width: 160px; height: 90px; border-radius: 4px; border: 1px solid #475569; }
  .review-box { background: #0f172a; padding: 10px; border-radius: 4px; font-size: 12px; margin-top: 12px; }
  .review-box label { display: block; margin-bottom: 4px; }
</style>
</head>
<body>
<h1>サムネイル3題材実物比較レビューパッケージ（T167）</h1>
<p class="desc">T160〜T166で構築された専用サムネイル自動描画経路（1280x720 PNG、自作オリジナルベクター素材、コントラスト検査、文字自動フィット）による実生成物です。<br>PC原寸、YouTube検索一覧（320x180）、スマートフォンサイドバー（160x90）の3段階での縮小可読性と、問い・図像の整合性をご確認ください。</p>

${topicResults.map(tr => `
  <h2>${tr.topic.name}</h2>
  <p class="desc">${tr.topic.description}（台本: <code>${tr.topic.fixture}</code>）</p>
  <div class="grid">
    ${tr.brief.candidates.map((cand: any) => {
      const rep = tr.reports.find((r: any) => r.variant === cand.id);
      const isA = cand.id === 'a';
      return `
        <div class="card ${isA ? 'selected' : ''}">
          <div class="card-header">
            <span>候補 ${cand.id.toUpperCase()}: ${cand.composition}型 ${isA ? '<b>(初期採用a)</b>' : ''}</span>
            <span class="badge ${rep?.ok ? 'pass' : ''}">${rep?.ok ? '品質検査 OK' : '要確認'}</span>
          </div>
          <table class="meta-table">
            <tr><td>主見出し</td><td><b>${cand.headline}</b></td></tr>
            <tr><td>補足</td><td>${cand.sub || 'なし'}</td></tr>
            <tr><td>構図 / モチーフ</td><td>${cand.composition} / ${cand.motifs.join(', ')}</td></tr>
            <tr><td>文字サイズ</td><td>${rep?.headlineSize.toFixed(0)} pt</td></tr>
            <tr><td>コントラスト比</td><td>${rep?.contrast.toFixed(2)} : 1 (基準4.5以上)</td></tr>
            <tr><td>容量</td><td>${((rep?.bytes ?? 0) / 1024).toFixed(1)} KB (上限2MiB)</td></tr>
          </table>

          <div class="preview-box">
            <div class="preview-label">原寸 1280x720 (幅100%縮小表示):</div>
            <img class="full" src="${tr.topic.key}/thumbnail-${cand.id}.png" alt="原寸">
          </div>

          <div class="preview-box">
            <div class="preview-label">PC検索結果・一覧相当 (320x180 実寸):</div>
            <img class="mid" src="${tr.topic.key}/thumbnail-${cand.id}-320.png" alt="320x180">
          </div>

          <div class="preview-box">
            <div class="preview-label">スマートフォン・関連動画相当 (160x90 実寸):</div>
            <img class="small" src="${tr.topic.key}/thumbnail-${cand.id}-160.png" alt="160x90">
          </div>

          <div class="review-box">
            <b>本人評価チェック:</b>
            <label><input type="checkbox"> 問い・知的好奇心を刺激するか</label>
            <label><input type="checkbox"> 図像・モチーフの意味が台本と一致するか</label>
            <label><input type="checkbox"> 160x90で主見出しが直感的に読めるか</label>
            <label><input type="checkbox"> 誇大表現・禁止表現がないか</label>
          </div>
        </div>
      `;
    }).join('')}
  </div>
`).join('')}

</body>
</html>
`;

  writeFileSync(join(OUT_DIR, 'index.html'), html, 'utf8');

  // レビュー用Markdown文書の生成
  const docLines: string[] = [
    '# サムネイル3題材実物比較レビューパッケージ（T167）',
    '',
    '- 生成日時: ' + new Date().toISOString(),
    '- レビュー対象: 格差・名字・寛容の3題材（計9候補）',
    '- プレビューHTML: `work/thumbnail-evaluation-package/index.html`',
    '',
    '## 1. 3題材の実生成物と実測一覧',
    '',
  ];

  for (const tr of topicResults) {
    docLines.push(`### ${tr.topic.name}`);
    docLines.push(`- 台本: \`${tr.topic.fixture}\``);
    docLines.push(`- 概要: ${tr.topic.description}`);
    docLines.push(`- Brief Input Hash: \`${tr.brief.inputHash}\``);
    docLines.push('');
    docLines.push('| 候補 | 構図 | 主見出し | 補足 | モチーフ | フォント | コントラスト | 容量 | 判定 |');
    docLines.push('| :---: | :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: |');
    for (const c of tr.brief.candidates) {
      const rep = tr.reports.find((r: any) => r.variant === c.id);
      docLines.push(`| ${c.id.toUpperCase()} | ${c.composition} | **${c.headline}** | ${c.sub || '-'} | ${c.motifs.join(', ')} | ${rep?.headlineSize.toFixed(0)}pt | ${rep?.contrast.toFixed(2)} | ${((rep?.bytes ?? 0) / 1024).toFixed(1)}KB | ${rep?.ok ? 'PASS' : 'FAIL'} |`);
    }
    docLines.push('');
  }

  docLines.push('## 2. 本人レビュー回答表（目安10〜15分）');
  docLines.push('');
  docLines.push('以下の4観点についてご確認いただき、採用候補（a/b/cのいずれか）または差戻し指示を記入してください。');
  docLines.push('');
  docLines.push('### 回答記入欄');
  docLines.push('');
  for (const tr of topicResults) {
    docLines.push(`#### 題材: ${tr.topic.name}`);
    docLines.push('1. **採用案の選択**: [ ] a案 (初期採用)  [ ] b案  [ ] c案  [ ] 差戻し要再生成');
    docLines.push('2. **問いの魅力・知的好奇心**: （例: aの見出しが最も動画の核心を突いていて引きが強い、等）');
    docLines.push('   - 回答: ');
    docLines.push('3. **図像の意味と台本の一致**: （例: 左右対比のモチーフが台本の対比構造を的確に表している、等）');
    docLines.push('   - 回答: ');
    docLines.push('4. **スマホ縮小（160x90）での視認性**: （例: 白文字＋影の効果で160x90でも明瞭に読める、等）');
    docLines.push('   - 回答: ');
    docLines.push('5. **修正要望・メモ**: ');
    docLines.push('   - メモ: ');
    docLines.push('');
  }

  docLines.push('## 3. 差戻し・採用変更の手順');
  docLines.push('採用候補を変更する場合:');
  docLines.push('```bash');
  docLines.push('./scripts/run src/cli.ts revise <jobId> --field thumbnail --to thumbnail-b.png --reason "b案の方がスマホでの視認性と対比が明確" --by "本人の名前"');
  docLines.push('```');
  docLines.push('変更後、承認ハッシュが自動的に失効するため、確認画面または `cli.ts review <jobId> approve ...` で新版を承認します。');
  docLines.push('');

  writeFileSync(resolve('docs/T167-THUMBNAIL-REVIEW-PACKAGE.md'), docLines.join('\n'), 'utf8');

  console.log('OK: レビューパッケージを生成しました: ' + OUT_DIR);
}

if (process.argv[1]?.endsWith('generate-thumbnail-review-package.ts')) {
  generateReviewPackage().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
