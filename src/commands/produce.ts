// produceコマンド: 本人が担う工程を通して制作する（T104、ADR-018）。
// new → select（本人）→ reflection（本人）→ script（エージェントの下書きに考察を差し込む）→ script-review（本人）→ render → review（本人）。
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {addReflection, assertRenderable, attachScript, authorshipLabel, createProject, linkRender, readProject, readScript, reviewScript, selectTopic} from '../production.ts';
import {workflowStatus} from '../review.ts';
import {sample, parseSampleArgs} from './sample.ts';

export const PRODUCE_USAGE = [
  '  produce new --candidates 候補.json --by 名前 [--demo]',
  '  produce status <id>',
  '  produce select <id> --candidate 候補id --by 本人の名前',
  '  produce reflection <id> (--file 考察.txt | --text 本文) --by 本人の名前 [--assisted-from 元の版]',
  '  produce script <id> --plan 下書き.json --by 名前',
  '  produce script-review <id> approve|reject --hash 台本の版 --by 本人の名前 [--note 理由]',
  '  produce render <id> [--subtitles burn|soft|both] [--resolution 720|1080]',
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
    const draft = need(option(args, '--plan'), '--plan');
    const s = attachScript(root, id, JSON.parse(readFileSync(draft, 'utf8')), need(by, '--by'), {draft});
    console.log(`作成: 台本 v${s.version}（${join(root, id, s.file)}）\n台本の版: ${s.hash}\n本人が内容を確認し、produce script-review ${id} approve --hash ${s.hash} --by 本人の名前 で承認する`);
  } else if (sub === 'script-review' && id) {
    const decision = args[2];
    if (decision !== 'approve' && decision !== 'reject') throw Error(`approve か reject を指定\n${PRODUCE_USAGE}`);
    const r = reviewScript(root, id, decision, need(option(args, '--hash'), '--hash'), option(args, '--note') ?? '', need(by, '--by'));
    console.log(`記録: 台本 v${r.scriptVersion} を${r.decision === 'approve' ? '承認' : '差戻し'}（${r.by}）`);
  } else if (sub === 'render' && id) {
    // 未選択・考察未入力・台本未承認なら、不足を表示して拒否する（強制オプションなし）。
    const {state, planPath} = assertRenderable(root, id);
    const opts = parseSampleArgs(args.slice(2));
    if (opts.plan) throw Error('render は制作案件の承認済み台本だけを使う（--plan は指定できない）');
    readScript(root, id, state.script!);
    const out = await sample({...opts, plan: planPath, job: {mode: state.mode, project: id, scriptHash: state.script!.hash, scriptVersion: state.script!.version}});
    linkRender(root, id, out.id, state.script!.hash, state.script!.version);
    console.log(`制作ジョブ: ${out.id}（台本 v${state.script!.version}）。完成動画は確認画面か review ${out.id} で本人が確認する`);
  } else throw Error(`produce の使い方:\n${PRODUCE_USAGE}`);
}
