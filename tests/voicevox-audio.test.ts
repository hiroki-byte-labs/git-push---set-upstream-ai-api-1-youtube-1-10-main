import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {VoicevoxAudio, parseVoicevoxWav, validateVoicevoxRights} from '../src/voicevox-audio.ts';
import type {VoicevoxRights} from '../src/voicevox-audio.ts';
import {buildWav} from '../src/local-say-audio.ts';
import {parseSampleArgs} from '../src/commands/sample.ts';
import {loadPlan} from '../src/plan.ts';

const rights: VoicevoxRights = {speaker: 0, credit: 'TEST ONLY: synthetic transport', termsUrl: 'https://example.org/test-only', checkedAt: '2026-10-16', commercialUseAllowed: true};
function tone(seconds: number) {
  const pcm = Buffer.alloc(Math.round(seconds * 24000) * 2);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(5000 * Math.sin(2 * Math.PI * 220 * i / 24000)), i * 2);
  return buildWav(pcm);
}
function transportFor(text: string, scaleBase = 1): typeof fetch {
  return (async (url, init) => {
    const u = new URL(String(url));
    if (u.pathname === '/audio_query') return Response.json({accent_phrases: [{moras: [{}]}]});
    const query = JSON.parse(String(init?.body));
    assert.equal(query.outputSamplingRate, 24000); assert.equal(query.outputStereo, false);
    assert.equal(query.postPhonemeLength, 0.4);
    return new Response(new Uint8Array(tone([...text].length / 5.5 * scaleBase / query.speedScale)));
  }) as typeof fetch;
}

test('VOICEVOX is opt-in, requires rights/credit and forbids remote endpoints/redirect destinations', () => {
  assert.deepEqual(parseSampleArgs(['--audio', 'voicevox']), {audio: 'voicevox'});
  for (const endpoint of ['https://127.0.0.1', 'http://example.org', 'http://localhost', 'http://127.0.0.1/api', 'http://user:password@127.0.0.1']) {
    assert.throws(() => new VoicevoxAudio({rights, endpoint}), /loopback/);
  }
  assert.throws(() => validateVoicevoxRights({...rights, credit: ''}), /クレジット/);
  assert.throws(() => new VoicevoxAudio({rights, charsPerSecond: 10}), /話速/);
});

test('strict PCM rejects truncated, missing, stereo, silent or clipped responses', () => {
  const valid = tone(2); assert.equal(parseVoicevoxWav(valid).sampleRate, 24000);
  assert.throws(() => parseVoicevoxWav(valid.subarray(0, -1)), /RIFF/);
  const stereo = Buffer.from(valid); stereo.writeUInt16LE(2, 22);
  assert.throws(() => parseVoicevoxWav(stereo), /mono/);
  assert.throws(() => parseVoicevoxWav(buildWav(Buffer.alloc(100))), /無音/);
  const clipped = Buffer.from(valid); clipped.writeInt16LE(32767, 44);
  assert.throws(() => parseVoicevoxWav(clipped), /クリッピング/);
});

test('real PCM duration drives bounded speed correction without assuming query speed equals speech rate', async () => {
  const text = '私たちは問いと説明の関係を落ち着いて確認しましょう。';
  const provider = new VoicevoxAudio({rights, transport: transportFor(text, 1.3)});
  const result = await provider.synthesize(text);
  assert.ok(result.speedScale > 1); assert.ok(result.actualRate >= 5.2 && result.actualRate <= 5.8);
});

test('unavailable engines and bad queries fail clearly; no mock fallback', async () => {
  const missing = new VoicevoxAudio({rights, transport: (async () => {throw Error('refused');}) as typeof fetch});
  await assert.rejects(missing.synthesize('テストです。'), /ローカルエンジン/);
  const bad = new VoicevoxAudio({rights, transport: (async () => Response.json({})) as typeof fetch});
  await assert.rejects(bad.synthesize('テストです。'), /query欠測/);
});

test('PCM placement never truncates speech to fit a cue', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'voicevox-overflow-'));
  try {
    const plan = loadPlan(JSON.parse(readFileSync('fixtures/sample-v2.json', 'utf8')));
    const text = 'これは字幕の枠を超えてしまう長い発話を確認するための試験用の文章です。';
    plan.scenes[0].cues = [{text, seconds: 2}];
    const provider = new VoicevoxAudio({rights, transport: transportFor(text)});
    await assert.rejects(provider.create(plan, join(dir, 'audio.wav')), /切り詰めない/);
    assert.equal(existsSync(join(dir, 'audio.wav')), false);
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('synthetic transport integration emits actual PCM/LUFS, text hashes, pending evaluation and credit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'voicevox-mock-media-'));
  try {
    const plan = loadPlan(JSON.parse(readFileSync('fixtures/sample-v2.json', 'utf8')));
    const text = '私たちは問いと説明の関係を落ち着いて確認しましょう。';
    plan.scenes = [{...plan.scenes[0], narration: text, seconds: 6, cues: [{text, seconds: 6}]}];
    await new VoicevoxAudio({rights, transport: transportFor(text)}).create(plan, join(dir, 'audio.wav'));
    const report = JSON.parse(readFileSync(join(dir, 'voicevox-report.json'), 'utf8'));
    assert.equal(report.ok, true); assert.equal(report.transport, 'injected-transport');
    assert.equal(report.voiceEvaluation, 'pending-human');
    assert.equal(report.slices[0].textSha256.length, 64);
    assert.ok(Number.isFinite(report.lufs)); assert.equal(report.clipping, 0);
    assert.equal(parseVoicevoxWav(readFileSync(join(dir, 'audio.wav'))).seconds, 6);
    assert.equal(readFileSync(join(dir, 'voicevox-attribution.txt'), 'utf8').trim(), rights.credit);
  } finally {rmSync(dir, {recursive: true, force: true});}
});
