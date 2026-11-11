from pathlib import Path
import wave

import numpy as np

RATE = 32000
DEST = Path(__file__).resolve().parents[2] / 'assets' / 'audio'
rng = np.random.default_rng(8017)


def time(duration):
    return np.arange(round(duration * RATE)) / RATE


def envelope(t, attack, decay):
    return np.minimum(1,t/attack)*np.exp(-t/decay)


def rotor(duration, low, high, drop, attack, decay, harmonics=(1,)):
    t=time(duration)
    phase=2*np.pi*(low*t+(high-low)*drop*(1-np.exp(-t/drop)))
    signal=sum(weight*np.sin(phase*(index+1)) for index,weight in enumerate(harmonics))
    return signal*envelope(t,attack,decay)


def air(duration, low, high, attack, decay):
    t=time(duration)
    frequencies=np.fft.rfftfreq(t.size,1/RATE)
    whitened=np.fft.rfft(rng.standard_normal(t.size))
    band=(frequencies/(frequencies+low))**3/(1+(frequencies/high)**4)
    filtered=np.fft.irfft(whitened*band,n=t.size)
    return filtered/(np.std(filtered)*3)*envelope(t,attack,decay)


def metal(duration, modes, attack=.0015):
    t=time(duration)
    return sum(gain*np.sin(2*np.pi*hz*t)*envelope(t,attack,decay) for hz,gain,decay in modes)


def combine(*layers):
    length=max(round(at*RATE)+len(sound) for at,sound in layers)
    result=np.zeros(length)
    for at,sound in layers:
        first=round(at*RATE)
        result[first:first+len(sound)]+=sound
    return result


def shot(strength=1):
    return combine(
        (0,.68*air(.073,1150,6700,.0007,.012)),
        (.001,strength*.75*rotor(.13,48,170,.015,.002,.028,(1,.21,.10))),
        (.004,.39*rotor(.097,260,720,.011,.0018,.023,(1,.46,.17))),
        (.023,.23*metal(.095,[(517,.7,.021),(1147,.22,.013),(2290,.12,.007)])),
    )


def write(name,sound,peak=.85):
    sound=np.tanh(sound*1.28)
    sound[-224:]*=np.linspace(1,0,224)
    sound*=peak/max(.0001,np.abs(sound).max())
    pcm=np.rint(sound*32767).astype('<i2')
    with wave.open(str(DEST/(name+'.wav')),'wb') as file:
        file.setparams((1,2,RATE,0,'NONE','not compressed'))
        file.writeframes(pcm.tobytes())


write('pulse',shot())
write('volley',combine((0,shot(1.25)),(.026,.69*shot(.82)),(.054,.49*shot(.58)),
                       (.007,.33*air(.17,560,3900,.004,.051))))
write('beam',combine((0,.56*metal(.14,[(1307,.45,.03),(2720,.32,.018),(4100,.19,.012)])),
                      (.002,.67*rotor(.27,68,240,.045,.003,.097,(1,.22,.31,.16))),
                      (.004,.57*air(.28,700,8400,.002,.062)),
                      (.034,.31*rotor(.22,348,532,.09,.017,.075,(1,.17,.13)))))
write('seeker',combine((0,.56*air(.13,800,5300,.003,.030)),
                        (.006,.76*rotor(.23,80,490,.046,.011,.060,(1,.54,.23))),
                        (.071,.19*metal(.16,[(433,.44,.045),(859,.35,.024),(1312,.21,.018)]))))
write('orbital',combine((0,.43*metal(.15,[(830,.65,.035),(1729,.28,.024),(2915,.14,.018)])),
                         (.035,.38*air(.28,440,3500,.031,.091)),
                         (.065,.58*rotor(.28,65,230,.064,.019,.096,(1,.28,.17)))))
write('burst',combine((0,.84*air(.27,195,4050,.001,.057)),
                       (.001,.96*rotor(.37,34,121,.043,.002,.083,(1,.19,.09))),
                       (.025,.31*metal(.27,[(129,.50,.089),(251,.27,.064),(363,.22,.040)]))))
write('hit',combine((0,.52*air(.081,1220,7200,.0007,.014)),
                     (.001,.74*metal(.085,[(313,.55,.014),(652,.28,.016),(2024,.18,.012)])),
                     (.001,.52*rotor(.076,80,200,.009,.0012,.019))),.74)
write('enemyfire',combine((0,.4*air(.11,1120,4500,.002,.023)),
                          (.002,.74*rotor(.17,126,415,.022,.003,.044,(1,.57,.27))),
                          (.04,.23*metal(.13,[(705,.61,.027),(1040,.38,.019)]))),.72)
