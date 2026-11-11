from pathlib import Path
import subprocess
import wave

import imageio_ffmpeg
import numpy as np

RATE = 44100
rng = np.random.default_rng(1654)
ROOT = Path(__file__).resolve().parents[2]
GENERATED = Path(__file__).resolve().parent / 'out'
GENERATED.mkdir(exist_ok=True)


def compose(name, bpm, boss):
    beat = 60 / bpm
    bars = 16
    length = round(bars * 4 * beat * RATE)
    mix = np.zeros((length, 2))

    def put(signal, position, gain, pan=0):
        start = round(position * beat * RATE)
        pan_angle = (pan + 1) * np.pi / 4
        left, right = np.cos(pan_angle), np.sin(pan_angle)
        stereo = signal[:, None] * gain * [left, right]
        indices = (start + np.arange(len(signal))) % length
        mix[indices] += stereo

    def oscillator(note, duration, voice):
        t = np.arange(round(duration * beat * RATE)) / RATE
        hz = 440 * 2 ** ((note - 69) / 12)
        phase = 2 * np.pi * hz * t
        if voice == 'pad':
            wave = np.sin(phase) + .23*np.sin(phase*2.003) + .10*np.sin(phase*3.006)
            envelope = np.minimum(1,t/.21) * np.minimum(1,(t[-1]-t)/.46)
        elif voice == 'bass':
            wave = np.sin(phase) + .45*np.sin(phase*2) + .16*np.sin(phase*3)
            envelope = np.minimum(1,t/.009) * np.minimum(1,(t[-1]-t)/.068) * np.exp(-2.4*t)
        else:
            shimmer = .07*np.sin(2*np.pi*5.1*t)
            wave = np.sin(phase+shimmer) + .28*np.sin(phase*2) + .14*np.sin(phase*3)
            envelope = np.minimum(1,t/.011) * np.minimum(1,(t[-1]-t)/.11) * np.exp(-4.7*t)
        return wave * envelope

    def synth(note, duration, voice, position, gain, pan=0):
        signal=oscillator(note,duration,voice)
        put(signal,position,gain,pan)
        if voice=='lead':
            put(signal,position+.75,gain*.19,-pan)
            put(signal,position+1.5,gain*.09,pan)

    kick_t=np.arange(round(.23*RATE))/RATE
    kick=np.sin(2*np.pi*(47*kick_t+3.9*(1-np.exp(-34*kick_t))))*np.exp(-19*kick_t)
    kick*=np.minimum(1,kick_t/.003)
    snare_t=np.arange(round(.20*RATE))/RATE
    noise=rng.normal(0,.46,snare_t.size)
    snare=(noise+.25*np.sin(2*np.pi*183*snare_t))*np.exp(-26*snare_t)*np.minimum(1,snare_t/.006)
    hats=[]
    for hit in range(6):
        noise=rng.normal(0,.33,round(.085*RATE))
        t=np.arange(noise.size)/RATE
        hats.append(np.diff(noise,prepend=0)*np.exp(-62*t)*np.minimum(1,t/.003))

    # Both cues use the same falling D–F–A–G motif from different registers.
    chords = [(50,53,57,60),(46,53,57,62),(48,55,60,64),(45,52,55,61)]
    if boss:
        chords = [(50,53,57,62),(51,55,58,63),(46,53,57,60),(45,52,55,61)]
    motif = [(0,74),(.75,77),(1.5,81),(2.75,79),(4.5,77),(5.25,74),(6.5,72),(7.25,73)]

    for bar in range(bars):
        chord=chords[bar%4]
        start=bar*4
        for note_index,note in enumerate(chord):
            synth(note+12,4.65,'pad',start-.12,.044 if boss else .054,(-.7,-.2,.3,.7)[note_index])
        for index, offset in enumerate((0,.5,1.5,2,2.75,3.5) if boss else (0,.75,1.5,2,3.25)):
            note=chord[0]-12+(12 if index in (2,5) else 0)
            synth(note,.44,'bass',start+offset,.22 if index==0 else .145)
        for index in range(8 if boss else 6):
            notes=(chord[0],chord[2],chord[1],chord[3],chord[2],chord[1],chord[3],chord[2])
            offset=index*.5+(0 if boss else .25)
            synth(notes[index]+(24 if index in (3,6) else 12),.6,'lead',start+offset,.062,(-1)**index*.56)
        for offset in ((0,1.5,2,3.5) if boss else (0,1.5,2.5)):
            put(kick,start+offset,.27 if offset==0 else .19)
        for offset in (1,3): put(snare,start+offset,.22,.09)
        for index in range(8):
            put(hats[(bar+index)%len(hats)],start+index*.5,.09 if index%2 else .045,(-1)**index*.48)
        if bar%4==3:
            for index in range(3): put(snare,start+3.25+index*.25,.10+index*.033,.2-index*.16)
        if bar%4==0:
            for offset,note in motif:
                synth(note+(12 if boss and offset>=4 else 0),.96,'lead',start+offset,.17 if boss else .14,-.14)

    mix=np.tanh(mix*1.7)*.82
    path=GENERATED/(name+'.wav')
    with wave.open(str(path),'wb') as wav:
        wav.setparams((2,2,RATE,0,'NONE','not compressed'))
        wav.writeframes((mix*32767).astype('<i2').tobytes())
    dest=ROOT/'assets'/'audio'/(name+'.mp3')
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-y','-i',str(path),
                    '-codec:a','libmp3lame','-q:a','2',str(dest)],check=True)
    print(f'{dest.name}: {length/RATE:.2f}s, {bpm} BPM, peak {np.abs(mix).max():.2f}')


compose('core-lockdown',144,True)
