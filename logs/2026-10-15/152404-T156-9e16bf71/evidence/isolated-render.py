import pathlib, tempfile, shutil, subprocess, json, hashlib, os
repo = pathlib.Path.cwd()
evidence = repo / 'logs/2026-10-15/152404-T156-9e16bf71/evidence'
root = pathlib.Path(tempfile.mkdtemp(prefix='T156-render-', dir='/private/tmp'))
def manifest():
    return {str(p): [p.stat().st_size, p.stat().st_mtime_ns, hashlib.sha256(p.read_bytes()).hexdigest()] for p in (repo/'outputs').rglob('*') if p.is_file()}
before = manifest()
for name in ['src', 'scripts', 'fixtures', 'config', 'prompts']:
    shutil.copytree(repo/name, root/name)
shutil.copy2(repo/'package.json', root/'package.json')
shutil.copytree(repo/'motion-lab', root/'motion-lab', ignore=shutil.ignore_patterns('node_modules', '.git', 'out', 'analysis'))
(root/'motion-lab/node_modules').symlink_to(repo/'motion-lab/node_modules', target_is_directory=True)
(root/'work').mkdir()
(root/'work/python-deps').symlink_to(repo/'work/python-deps', target_is_directory=True)
node = shutil.which('node')
cmd = ['./scripts/run', 'src/cli.ts', 'sample', '--plan', 'fixtures/sample-surname-illustration.json', '--renderer', 'remotion', '--subtitles', 'both']
(evidence/'isolation.json').write_text(json.dumps({'root':str(root),'command':cmd,'NODE_BIN':node},indent=2))
with (evidence/'isolated-render.txt').open('w') as f:
    try:
        r=subprocess.run(cmd,cwd=root,env={**os.environ,'NODE_BIN':node},stdout=f,stderr=subprocess.STDOUT,timeout=240)
        f.write('\nEXIT='+str(r.returncode)+'\n')
    except subprocess.TimeoutExpired:
        f.write('\nTIMEOUT=240s\n')
for p in (root/'outputs').rglob('*.json'):
    if p.name in ['job.json','media-check.json','remotion-props.json']:
        shutil.copy2(p,evidence/('isolated-'+p.name))
(evidence/'outputs-preserved.json').write_text(json.dumps({'filesBefore':len(before),'unchanged':before==manifest()},indent=2))
print(root)
