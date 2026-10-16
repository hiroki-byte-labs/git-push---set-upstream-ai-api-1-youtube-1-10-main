"""T139 reproduction harness; only writes to the recorded temporary copy and evidence.
Run short, then long only after independent short media verification.
No API, credentials, publishing, natural TTS or human approval substitution.
"""
import json, pathlib, subprocess, sys, time, copy

E = pathlib.Path(__file__).resolve().parent
CFG = json.loads((E / 'isolation.json').read_text())
ROOT = pathlib.Path(CFG['root'])
MODE = sys.argv[1]
assert MODE in ('short', 'long')
# Long was attempted only to diagnose the same environment failure and verify real long audio.
# It is not a qualified long MP4 run after a passing short MP4.
commands = []

def run(name, args, expected=0):
    started = time.monotonic()
    p = subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                       env=__import__('os').environ | {'NODE_BIN': CFG['node']})
    commands.append({'name': name, 'argv': args, 'cwd': str(ROOT),
                     'exitCode': p.returncode, 'elapsedSec': time.monotonic()-started})
    (E / f'{MODE}-{name}.txt').write_text(p.stdout + p.stderr + f'\nEXIT={p.returncode}\n')
    (E / f'{MODE}-commands.json').write_text(json.dumps(commands, indent=2))
    if expected is not None and p.returncode != expected:
        raise RuntimeError(f'{name}: exit {p.returncode}, expected {expected}')
    return p.stdout

cli = ['./scripts/run', 'src/cli.ts', 'produce']
draft = json.loads((ROOT / 'fixtures/draft-general-demo.json').read_text())
draft['id'] = f't139-{MODE}-mock'
if MODE == 'short':
    # Preserve validated narration duration instead of compressing text into invalid cues.
    pass
else:
    originals = draft['scenes']
    # Twenty 30s scenes plus one reflection; real render of the full timeline, no looped MP4.
    scenes = [copy.deepcopy(originals[0])]
    scenes += [copy.deepcopy(originals[1+i%4]) for i in range(18)]
    scenes += [copy.deepcopy(originals[5]), copy.deepcopy(originals[-1])]
    for i, scene in enumerate(scenes):
        if scene.get('role') != 'reflection':
            for cue in scene['cues']: cue['seconds'] = 30 / len(scene['cues'])
            scene['seconds'] = 30
        scene['chapter'] = f'媒体検証区間{1+i//5}'
    draft['scenes'] = scenes
draft['note'] = 'T139 synthetic media verification only; no natural narration or public use.'
path = ROOT / f'fixtures/t139-{MODE}.json'
path.write_text(json.dumps(draft, ensure_ascii=False, indent=2))
out = run('new', cli + ['new', '--demo', '--candidates', 'fixtures/topic-candidates-demo.json', '--by', 'test-agent'])
project = out.split('作成: ')[1].splitlines()[0].strip()
run('unselected-render-rejected', cli + ['render', project, '--renderer', 'remotion'], 1)
run('select', cli + ['select', project, '--candidate', 'price-index', '--by', 'test-agent'])
run('reflection', cli + ['reflection', project, '--text', 'デモ用の仮の考察です。本人の考察ではありません。', '--by', 'test-agent'])
out = run('script', cli + ['script', project, '--plan', str(path), '--by', 'test-agent'])
script_hash = out.split('台本の版: ')[1].splitlines()[0].strip()
run('unapproved-render-rejected', cli + ['render', project, '--renderer', 'remotion'], 1)
run('demo-script-approval', cli + ['script-review', project, 'approve', '--hash', script_hash, '--by', 'test-agent'])
run('render', ['/usr/bin/time', '-l'] + cli + ['render', project, '--renderer', 'remotion', '--resolution', '720', '--subtitles', 'both'])
job = json.loads((ROOT / 'outputs/latest.json').read_text())['id']
directory = ROOT / 'outputs' / job
(E / f'{MODE}-result.json').write_text(json.dumps({'project': project, 'job': job, 'directory': str(directory), 'scriptHash': script_hash}, indent=2))
for filename in ['job.json', 'plan.json', 'media-check.json', 'mock-audio-check.json', 'remotion-props.json', 'render-report.json', 'subtitles.vtt']:
    (E / f'{MODE}-{filename}').write_bytes((directory / filename).read_bytes())
print(directory)
