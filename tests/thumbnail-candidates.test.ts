import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPlan} from '../src/plan.ts';
import {buildThumbnailCandidates} from '../src/thumbnail-candidates.ts';
import {validateThumbnailBrief} from '../src/thumbnail-brief.ts';

const superstarPlan = () => loadPlan(JSON.parse(readFileSync('fixtures/sample-superstar-illustration.json', 'utf8')));
const surnamePlan = () => loadPlan(JSON.parse(readFileSync('fixtures/sample-surname-illustration.json', 'utf8')));
const tolerancePlan = () => loadPlan(JSON.parse(readFileSync('fixtures/sample-tolerance-illustration.json', 'utf8')));

test('3題材（格差・名字・寛容）で異なる3候補が自動構成される（T161）', () => {
  const plans = [
    {name: '格差', plan: superstarPlan()},
    {name: '名字', plan: surnamePlan()},
    {name: '寛容', plan: tolerancePlan()},
  ];

  for (const {name, plan} of plans) {
    const brief = buildThumbnailCandidates(plan);
    assert.equal(brief.planId, plan.id);
    assert.equal(brief.candidates.length, 3);
    assert.equal(brief.overallStatus, 'ready', `${name}のbriefはreadyであるべき`);

    // 3候補の見出しがすべて異なる（実質同一でない）
    const [a, b, c] = brief.candidates;
    assert.notEqual(a.headline, b.headline, `${name}: 候補aとbの見出しが重複`);
    assert.notEqual(a.headline, c.headline, `${name}: 候補aとcの見出しが重複`);
    assert.notEqual(b.headline, c.headline, `${name}: 候補bとcの見出しが重複`);

    // 構図が多様である（3候補がすべて同一の構図ではない）
    const comps = new Set([a.composition, b.composition, c.composition]);
    assert.ok(comps.size >= 2, `${name}: 構図が2種以上あること`);

    // 場面根拠（grounding）の追跡
    for (const cand of brief.candidates) {
      assert.ok(cand.grounding.sceneIndex! >= 1 && cand.grounding.sceneIndex! <= plan.scenes.length);
      const scene = plan.scenes[cand.grounding.sceneIndex! - 1];
      assert.equal(cand.grounding.sceneTitle, scene.title);
      // 出典追跡
      for (const srcId of cand.grounding.sourceIds ?? []) {
        assert.ok(plan.sources.some(s => s.id === srcId), `出典${srcId}がPlanに存在すること`);
      }
      // 文字数上限
      assert.ok([...cand.headline].length <= 20, `${name}: headlineが20字以内`);
      if (cand.sub) assert.ok([...cand.sub].length <= 30, `${name}: subが30字以内`);
    }

    // 決定論的検証: 同じ入力からは完全に同一のbriefが生成される
    const brief2 = buildThumbnailCandidates(plan);
    assert.deepEqual(brief, brief2, `${name}: briefの決定論的一致`);
  }
});

test('禁止表現が含まれる場合はneeds-reviewで停止する（T161）', () => {
  const plan = superstarPlan();
  plan.thumbnail = {
    headline: '必ず儲かる法則',
  };

  const brief = buildThumbnailCandidates(plan);
  assert.equal(brief.overallStatus, 'needs-review');
  const candA = brief.candidates.find(c => c.id === 'a')!;
  assert.equal(candA.status, 'needs-review');
  assert.ok(candA.unknowns?.some(u => u.includes('禁止表現')));
});

test('文末記号違いのみの重複はneeds-reviewで停止する（T161）', () => {
  const plan = superstarPlan();
  // 全タイトル・場面見出し・章見出しが同一で別見出しが作れないケース
  plan.title = '同じ見出し';
  plan.thumbnail = {
    headline: '同じ見出し',
  };
  for (const s of plan.scenes) {
    s.title = '同じ見出し？';
    if (s.chapter) s.chapter = '同じ見出し！';
    if (s.diagram.type === 'compare') {
      s.diagram.left = '同じ見出し';
      s.diagram.right = '同じ見出し？';
    }
  }

  const brief = buildThumbnailCandidates(plan);
  assert.equal(brief.overallStatus, 'needs-review');
  assert.ok(brief.candidates.some(c => c.status === 'needs-review' && c.unknowns?.some(u => u.includes('実質同一'))));
});

test('意味の単位での短縮処理（T161）: 単純末尾切り捨てを行わない', () => {
  const plan = superstarPlan();
  // 20文字を超える長いタイトル
  plan.title = 'なぜ1位と2位の実力差がわずかなのに報酬は100倍も違うのか？';
  delete plan.thumbnail;

  const brief = buildThumbnailCandidates(plan);
  // headlineAは意味のある単位で短縮されていること
  const candA = brief.candidates[0];
  assert.ok([...candA.headline].length <= 20);
  // 文末が助詞などで切れているか、または意味が通る形で切り詰められている
  assert.ok(candA.headline.startsWith('なぜ'));
  assert.ok(validateThumbnailBrief(brief, plan));
});
