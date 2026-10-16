"""Independent WAV probe/decode and Plan-to-Remotion timing checks, including missing MP4."""
import json, pathlib, subprocess, hashlib, os
E = pathlib.Path(__file__).resolve().parent
C = json.loads((E/'isolation.json').read_text())
R = pathlib.Path(C['root'])
FF = R/'work/python-deps/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1'
commands = []
def run(name, args):
    env = os.environ | {'DYLD_LIBRARY_PATH':str(pathlib.Path(C['ffprobe']).parent)}
    p = subprocess.run([str(a) for a in args], cwd=R, capture_output=True, text=True,env=env)
    commands.append({'name':name,'argv':[str(a) for a in args],'exitCode':p.returncode,'DYLD_LIBRARY_PATH':env['DYLD_LIBRARY_PATH']})
    (E/f'{name}.txt').write_text(p.stdout+p.stderr+f'\nEXIT={p.returncode}\n')
    return p
summary = []
for mode in ['short','long']:
    d = next((R/'outputs').glob(f't139-{mode}-mock-*'))
    for f in ['job.json','plan.json','lint.json','metadata.json','mock-audio-check.json','remotion-props.json','subtitles.vtt']:
        (E/f'{mode}-{f}').write_bytes((d/f).read_bytes())
    plan = json.loads((d/'plan.json').read_text())
    props = json.loads((d/'remotion-props.json').read_text())
    audio = json.loads((d/'mock-audio-check.json').read_text())
    seconds = sum(s['seconds'] for s in plan['scenes'])
    probe = run(f'{mode}-audio-ffprobe',[C['ffprobe'],'-v','error','-show_streams','-show_format','-of','json',d/'audio.wav'])
    assert probe.returncode == 0
    info = json.loads(probe.stdout)
    assert abs(float(info['format']['duration']) - seconds) < 1/24000
    decode = run(f'{mode}-audio-full-decode',[FF,'-hide_banner','-nostdin','-v','error','-xerror','-i',d/'audio.wav','-map','0:a:0','-f','null','-'])
    assert decode.returncode == 0 and not decode.stderr.strip()
    # Verify every cue's absolute frame boundary against real audio slice boundaries.
    cues = [c for scene in props['scenes'] for c in scene['cues']]
    timing = []
    assert len(cues) == len(audio['cues'])
    for cue, measured in zip(cues,audio['cues']):
        delta = abs(cue['startFrame']/props['fps']-measured['start'])
        end_delta = abs((cue['startFrame']+cue['durationFrames'])/props['fps']-measured['end'])
        assert max(delta,end_delta) <= 1/props['fps']
        timing.append({'startFrame':cue['startFrame'],'durationFrames':cue['durationFrames'],'audioStart':measured['start'],'audioEnd':measured['end'],'maxDeltaSec':max(delta,end_delta)})
    assert props['totalFrames'] == seconds*24
    # Execute probes even for missing video; no fabricated frame/decode success.
    mp4_probe = run(f'{mode}-mp4-ffprobe',[C['ffprobe'],'-v','error','-count_frames','-show_streams','-show_format','-of','json',d/'sample.mp4'])
    mp4_decode = run(f'{mode}-mp4-full-decode',[FF,'-hide_banner','-nostdin','-v','error','-xerror','-i',d/'sample.mp4','-f','null','-'])
    summary.append({'mode':mode,'directory':str(d),'audioSeconds':seconds,'decodedAudioSamples':audio['decodedSamples'],'wavSha256':hashlib.sha256((d/'audio.wav').read_bytes()).hexdigest(),'audioProbeExit':probe.returncode,'audioDecodeExit':decode.returncode,'cueCount':len(cues),'cueTiming':timing,'expectedVideoFrames':props['totalFrames'],'measuredVideoFrames':None,'mp4Exists':(d/'sample.mp4').exists(),'mp4ProbeExit':mp4_probe.returncode,'mp4DecodeExit':mp4_decode.returncode,'layout':'unverified: renderer produced zero frames; source report uses fixed boxes','browserPlayback':'unverified','representativeFramePngs':[],'loudness':audio['loudness'],'audioSync':audio['sync']})
(E/'independent-media-summary.json').write_text(json.dumps(summary,indent=2))
(E/'independent-media-commands.json').write_text(json.dumps(commands,indent=2))
print(json.dumps([{k:v for k,v in s.items() if k!='cueTiming'} for s in summary],indent=2))
