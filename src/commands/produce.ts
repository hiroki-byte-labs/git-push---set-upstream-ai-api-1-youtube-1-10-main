// produceコマンド: 本人が担う工程を通して制作する（T104、ADR-018）。
// new → select（本人）→ reflection（本人）→ script（エージェントの下書きに考察を差し込む）→ script-review（本人）→ render → review（本人）。
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {addReflection, assertRenderable, attachScript, authorshipLabel, createProject, linkRender, projectState, readProject, readScript, reviewScript, selectTopic} from '../production.ts';
import {checkFactAndRights} from '../fact-check.ts';
import type {ClaimRecord, AssetRightRecord, FactCheckReport} from '../fact-check.ts';
import {getPipelineManifest, savePipelineManifest} from '../orchestration-pipeline.ts';
import {workflowStatus} from '../review.ts';
import {sample, parseSampleArgs} from './sample.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_DRAFT = join(REPO_ROOT, 'fixtures/draft-price-index.json');

export const PRODUCE_USAGE = [
  '  produce new --candidates 候補.json --by 名前 [--demo]',
  '  produce status <id>',
  '  produce select <id> --candidate 候補id --by 本人の名前',
  '  produce reflection <id> (--file 考察.txt | --text 本文) --by 本人の名前 [--assisted-from 元の版]',
  '  produce script <id> [--plan 下書き.json] --by 名前',
  '  produce fact-check <id> [--report レポート.json] [--by 名前]',
  '  produce script-review <id> approve|reject --hash 台本の版 --by 本人の名前 [--note 理由]',
  '  produce render <id> [--subtitles burn|soft|both] [--resolution 720|1080] [--renderer native|remotion] [--audio mock|say] [--queue] [--queue-dir ディレクトリ] [--concurrency 並行数]',
].join('\n');

const STAGE_LABEL: Record<string, string> = {
  'topic-selection': '題材の選択待ち（本人）', reflection: '考察の入力待ち（本人）', script: '台本の作成待ち', 'script-review': '台本の確認待ち（本人）',
  render: '制作待ち', 'video-review': '完成動画の確認待ち（本人）', done: '完成動画を承認済み（投稿は未実装・無効）',
};
export const stageLabel = (s: string) => STAGE_LABEL[s] ?? s;

function option(args: string[], name: string) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const need = (v: string | undefined, name: string) => {
  if (v === undefined || v.startsWith('--')) throw Error(`${name} が必要\n${PRODUCE_USAGE}`);
  return v;
};

export function printStatus(root: string, id: string) {
  const st = workflowStatus(root, id);
  const p = readProject(root, id);
  const factPath = existsSync(join(root, id, 'fact-check.json')) ? 'fact-check.json' : existsSync(join(root, id, 'fact-check-report.json')) ? 'fact-check-report.json' : null;
  let factStr = '未確認';
  if (factPath) {
    try {
      const fc = JSON.parse(readFileSync(join(root, id, factPath), 'utf8'));
      factStr = fc.ok ? '合格（エスカレーション0件）' : `要確認（エスカレーション${fc.escalations?.length ?? 0}件）`;
    } catch {}
  }
  const lines = [
    `${id}（${st.mode === 'demo' ? 'デモ: 試験用。本番の承認に転用できない' : '本番'}）`,
    `工程: ${stageLabel(st.stage)}`,
    `不足: ${st.missing.length ? '\n  - ' + st.missing.join('\n  - ') : 'なし'}`,
    '題材候補:',
    ...p.workflow.candidates.map(c => `  ${st.candidate?.id === c.id ? '●' : '○'} ${c.id}: ${c.title}（入口: ${c.hook} / 概念: ${c.concept}）`),
    `選択: ${st.selection ? `${st.selection.candidateId}（${st.selection.by}、${st.selection.at}）` : '未選択'}`,
    `考察: ${st.reflection ? `v${st.reflection.version} ${authorshipLabel(st.mode, st.reflection)}（${st.reflection.by}）「${[...st.reflection.text].slice(0, 40).join('')}${[...st.reflection.text].length > 40 ? '…' : ''}」` : '未入力'}`,
    `台本: ${st.script ? `v${st.script.version} ${st.script.file} 状態=${st.scriptState}（${st.scriptReason}）` : st.scriptReason}`,
    ...(st.script ? [`台本の版: ${st.script.hash}`] : []),
    `事実・権利確認: ${factStr}`,
    `動画: ${st.renders.length ? st.renders.map(r => `${r.jobId} ${r.approval?.state ?? '不明'}`).join(', ') : 'なし'}`,
  ];
  console.log(lines.join('\n'));
}

export async function produce(args: string[], root = 'outputs') {
  const [sub, id] = args;
  const by = option(args, '--by');
  if (sub === 'new') {
    const created = createProject(root, JSON.parse(readFileSync(need(option(args, '--candidates'), '--candidates'), 'utf8')), {demo: args.includes('--demo'), by: need(by, '--by')});
    console.log(`作成: ${created}`);
    printStatus(root, created);
  } else if (sub === 'status' && id) {
    printStatus(root, id);
  } else if (sub === 'select' && id) {
    const s = selectTopic(root, id, need(option(args, '--candidate'), '--candidate'), need(by, '--by'));
    console.log(`記録: 題材 ${s.candidateId}（${s.by}）`);
  } else if (sub === 'reflection' && id) {
    const file = option(args, '--file'), text = option(args, '--text');
    if ((file === undefined) === (text === undefined)) throw Error(`--file か --text のどちらか一方が必要\n${PRODUCE_USAGE}`);
    const from = option(args, '--assisted-from');
    if (from !== undefined && !/^\d+$/.test(from)) throw Error('--assisted-from は版番号');
    const r = addReflection(root, id, file !== undefined ? readFileSync(file, 'utf8') : text!, need(by, '--by'), from !== undefined ? {assistedFrom: Number(from)} : {});
    console.log(`記録: 考察 v${r.version}（${authorshipLabel(readProject(root, id).mode, r)}、${[...r.text].length}字）。台本は produce script で作り直す`);
  } else if (sub === 'script' && id) {
    const draft = option(args, '--plan') ?? (existsSync('fixtures/draft-price-index.json') ? 'fixtures/draft-price-index.json' : DEFAULT_DRAFT);
    const s = attachScript(root, id, JSON.parse(readFileSync(draft, 'utf8')), need(by, '--by'), {draft});
    console.log(`作成: 台本 v${s.version}（${join(root, id, s.file)}）\n台本の版: ${s.hash}\n事実・権利確認を行い（produce fact-check ${id}）、本人が内容を確認して produce script-review ${id} approve --hash ${s.hash} --by 本人の名前 で承認する`);
  } else if (sub === 'fact-check' && id) {
    const st = projectState(root, id);
    if (!st.script) throw Error('台本がありません。先に produce script を実行してください');
    const plan = readScript(root, id, st.script);
    const reportFile = option(args, '--report');
    let reportRaw: any;
    if (reportFile) {
      if (!existsSync(reportFile)) throw Error(`指定されたレポートファイルがありません: ${reportFile}`);
      reportRaw = JSON.parse(readFileSync(reportFile, 'utf8'));
    } else {
      const claims: ClaimRecord[] = plan.sources.map(s => ({
        claim: `${s.title}の記載に基づく説明`,
        sourceId: s.id,
        citation: s.title,
        url: s.url,
        status: 'verified' as const,
        checkedAt: s.accessedAt || new Date().toISOString().slice(0, 10),
      }));
      if (claims.length === 0) {
        claims.push({
          claim: plan.title,
          sourceId: 'none',
          citation: '出典なし',
          url: 'https://example.com/unverified',
          status: 'unverified' as const,
          checkedAt: new Date().toISOString().slice(0, 10),
          note: '台本に出典が未登録です',
        });
      }
      const assets = [
        {
          assetId: 'project-in-house-svg',
          type: 'svg' as const,
          origin: 'original' as const,
          license: 'Project In-house',
          attributionRequired: false,
          commercialUseAllowed: true,
          checkedAt: new Date().toISOString().slice(0, 10),
        },
        {
          assetId: 'system-font',
          type: 'font' as const,
          origin: 'licensed' as const,
          license: 'System Font License',
          attributionRequired: false,
          commercialUseAllowed: true,
          checkedAt: new Date().toISOString().slice(0, 10),
        },
      ];
      reportRaw = {
        schema: 1,
        planId: plan.id,
        claims,
        assets,
      };
    }
    const report = checkFactAndRights(reportRaw);
    const factJsonPath = join(root, id, 'fact-check.json');
    writeFileSync(factJsonPath, JSON.stringify(report, null, 2));

    const manifest = getPipelineManifest(root, id);
    manifest.stages['fact-check'] = {
      stage: 'fact-check',
      status: report.ok ? 'completed' : 'failed',
      outputVersion: createHash('sha256').update(JSON.stringify(report)).digest('hex'),
      outputFiles: ['fact-check.json'],
      updatedAt: new Date().toISOString(),
      ...(report.ok ? {} : {error: `エスカレーション ${report.escalations.length}件`}),
    };
    savePipelineManifest(root, id, manifest);

    console.log(`記録: 事実・権利確認 主張=${report.claims.length}件 素材=${report.assets.length}件 結果=${report.ok ? '合格（エスカレーションなし）' : `要確認（エスカレーション ${report.escalations.length}件）`}`);
    if (report.escalations.length > 0) {
      console.log('要確認事項:\n  - ' + report.escalations.join('\n  - '));
    }
  } else if (sub === 'script-review' && id) {
    const decision = args[2];
    if (decision !== 'approve' && decision !== 'reject') throw Error(`approve か reject を指定\n${PRODUCE_USAGE}`);
    if (decision === 'approve') {
      const factPath = existsSync(join(root, id, 'fact-check.json'))
        ? join(root, id, 'fact-check.json')
        : existsSync(join(root, id, 'fact-check-report.json'))
        ? join(root, id, 'fact-check-report.json')
        : null;
      if (!factPath) {
        throw Error('事実・権利確認レポート（fact-check.json）がありません。produce fact-check を先に実行してください');
      }
      const factReport: FactCheckReport = JSON.parse(readFileSync(factPath, 'utf8'));
      if (!factReport.ok || (factReport.escalations && factReport.escalations.length > 0)) {
        throw Error(`事実・権利確認にエスカレーション項目（${factReport.escalations?.length ?? 0}件）があるため承認できません:\n- ${(factReport.escalations ?? []).join('\n- ')}`);
      }
    }
    const r = reviewScript(root, id, decision, need(option(args, '--hash'), '--hash'), option(args, '--note') ?? '', need(by, '--by'));
    if (decision === 'approve') {
      const manifest = getPipelineManifest(root, id);
      manifest.stages['script-review'] = {
        stage: 'script-review',
        status: 'completed',
        updatedAt: new Date().toISOString(),
      };
      savePipelineManifest(root, id, manifest);
    }
    console.log(`記録: 台本 v${r.scriptVersion} を${r.decision === 'approve' ? '承認' : '差戻し'}（${r.by}）`);
  } else if (sub === 'render' && id) {
    // 未選択・考察未入力・台本未承認なら、不足を表示して拒否する（強制オプションなし）。
    const {state, planPath} = assertRenderable(root, id);
    const opts = parseSampleArgs(args.slice(2));
    if (opts.plan) throw Error('render は制作案件の承認済み台本だけを使う（--plan は指定できない）');
    if (opts.queue) {
      const {runProduceRenderWithQueue} = await import('../queue-adapter.ts');
      const out = await runProduceRenderWithQueue(root, id, opts);
      console.log(`[queue] 制作ジョブ: ${out.id}（キュー経由で完了）。完成動画は確認画面か review ${out.id} で本人が確認する`);
      return;
    }
    readScript(root, id, state.script!);
    const out = await sample({...opts, plan: planPath, job: {mode: state.mode, project: id, scriptHash: state.script!.hash, scriptVersion: state.script!.version}});
    linkRender(root, id, out.id, state.script!.hash, state.script!.version);
    console.log(`制作ジョブ: ${out.id}（台本 v${state.script!.version}）。完成動画は確認画面か review ${out.id} で本人が確認する`);
  } else throw Error(`produce の使い方:\n${PRODUCE_USAGE}`);
}
