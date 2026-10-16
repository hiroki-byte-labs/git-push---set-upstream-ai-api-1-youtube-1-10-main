from pathlib import Path
import re, hashlib, json, difflib

log = Path(__file__).resolve().parent
report = (log / 'AUDIT.md').read_text()
refs = re.findall(r'(?<![\w/-])((?:src|tests|tickets|orchestration|motion-lab)/[\w/.-]+):(\d+)', report)
for path, line in refs:
    p = Path(path)
    assert p.is_file() and 1 <= int(line) <= len(p.read_text().splitlines()), (path, line)
for path in re.findall(r'(?m)^- (logs/[^\s]+)$', report):
    assert Path(path).is_file(), path
before = json.loads((log / 'other-tickets-before.json').read_text())
for path, digest in before.items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, path
graph = {}
for p in Path('tickets').glob('T*.md'):
    body = p.read_text()
    tid = re.search(r'^id: (T\d+)$', body, re.M)[1]
    graph[tid] = re.findall(r'T\d+', re.search(r'^depends: *(.*)$', body, re.M)[1])
old_target = (log / 'before-T142.md').read_text()
assert re.search(r'^depends:.*$', old_target, re.M)[0] == re.search(r'^depends:.*$', Path('tickets/T142.md').read_text(), re.M)[0]
proposal = dict(graph)
proposal['T021'] = ['T020', 'T027']
proposal['T022'] = ['T020', 'T021', 'T024', 'T028']
for name, g in [('existing', graph), ('proposal-A', proposal)]:
    active, done = set(), set()
    def visit(t):
        assert t not in active, ('cycle', t)
        if t in done:
            return
        assert t in g and len(g[t]) == len(set(g[t])), t
        active.add(t)
        for d in g[t]:
            visit(d)
        active.remove(t)
        done.add(t)
    for t in g:
        visit(t)
    assert g['T060'] == ['T024', 'T029']
    assert g['T028'] == ['T024', 'T027']
    print(name, 'no missing references, cycles or duplicates; T060/T028 safety edges retained')
print('line references:', len(refs), 'other tickets unchanged:', len(before), 'T142 depends unchanged')
out = []
for path in ['README.md', 'docs/SPEC.md', 'docs/STATUS.md']:
    p = Path(path)
    out.extend(difflib.unified_diff((log / ('before-' + p.name)).read_text().splitlines(True), p.read_text().splitlines(True), fromfile=path + ' (start)', tofile=path + ' (T142)'))
(log / 'docs-diff.patch').write_text(''.join(out))
paths = sorted({path for path, _ in refs} | {'README.md', 'docs/SPEC.md', 'docs/STATUS.md', 'tests/audio-pipeline.test.ts', 'src/mock-audio-media.ts'})
(log / 'source-lines.txt').write_text('\n'.join('\n' + path + '\n' + '\n'.join(f'{i}: {s}' for i, s in enumerate(Path(path).read_text().splitlines(), 1)) for path in paths) + '\n')
print('PASS: references, dependency proposals, unchanged tickets, source snapshots and exact document diffs')
