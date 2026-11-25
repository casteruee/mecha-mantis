import sys
from pathlib import Path
import av
import numpy as np

master=Path(sys.argv[1])
rate=48000
t=np.arange(round(34.6*rate))/rate
tau=2*np.pi
fade=np.clip(t/.12,0,1)*np.clip((34.6-t)/.85,0,1)
bed=(.052*np.sin(tau*50*t)+.022*np.sin(tau*75*t+.35*np.sin(t))+.014*np.sin(tau*150*t))*(.7+.18*np.cos(t*.7))
mix=np.stack([bed,bed.copy()])
def cue(start,duration,low,high,level,pan):
    u=np.arange(int(duration*rate))/rate
    env=np.sin(np.pi*u/duration)**2
    phase=tau*(low*u+(high-low)*u*u/(2*duration))
    wave=level*env*(np.sin(phase)+.24*np.sin(2.03*phase)+.09*np.sin(3.02*phase))
    i=round(start*rate)
    mix[:,i:i+len(u)]+=np.array([[np.sqrt((1-pan)/2)],[np.sqrt((1+pan)/2)]])*wave

# Transients follow the lens reveal, planted foot, rotor, needle and strike.
for params in [
    (.02,.26,780,1250,.09,-.13),(.30,1.45,310,84,.13,0),(1.83,.62,110,43,.23,0),
    (2.91,.42,185,320,.08,-.36),(3.42,.88,195,300,.08,.23),(4.40,.48,330,155,.06,.1),
    (5.32,.27,155,57,.19,-.28),(6.82,.55,205,95,.12,.25),
    (8.60,.74,118,247,.14,-.24),(10.24,.53,340,210,.06,.26),
    (11,.81,310,690,.072,-.3),(12.22,.61,440,280,.055,.31),
    (13.3,.50,250,425,.09,.26),(14.03,.67,610,980,.064,.32),
    (15.66,1.82,190,65,.14,-.36),(18.79,.65,112,53,.18,0),
    (19.71,.54,110,255,.12,-.1),(20.24,.20,910,158,.23,-.26),
    (20.30,.71,96,41,.34,0),(21.80,.62,210,420,.08,.23),(22.88,.5,570,810,.044,-.1)
]:
    cue(params[0]+(11 if params[0]>=15.65 else 0),*params[1:])
rng=np.random.default_rng(17)
def air(start,duration,amp,pan):
    n=int(duration*rate)
    u=np.arange(n)/n
    noise=np.convolve(rng.normal(size=n),np.ones(12)/12,mode='same')
    signal=amp*noise*np.sin(np.pi*u)**2
    idx=round(start*rate)
    mix[:,idx:idx+n]+=np.array([[1-pan],[1+pan]])*signal
for args in [(.37,1.59,.21,-.13),(5.20,.16,.18,-.21),(10.92,.91,.13,.24),
             (13.84,.82,.12,.22),(16.33,1.68,.18,-.28),(20.05,.35,.48,-.23)]:
    air(args[0]+(11 if args[0]>=15.65 else 0),*args[1:])
for k in range(16):
    cue(8.63+k*.142,.055,440+12*k,220,.034, .32*np.sin(k*.56))
for cue_args in [(15.99,.53,148,375,.10,.28),(17.20,.61,260,490,.065,-.2),(18.52,.58,334,87,.13,0),(19.75,.92,98,270,.13,-.33),(21.16,.52,175,390,.09,.23),(24.98,.71,350,96,.12,-.24),(25.94,.42,105,45,.22,0)]:
    cue(*cue_args)
for i in range(7):
    cue(16.16+i*.072,.08,720+i*38,360,.05,.35-i*.08)
air(21.57,2.43,.14,-.24)
mix=(mix*fade).astype('float32')
destination=master.with_name(master.stem+'_mix.mp4')
with av.open(str(master)) as src,av.open(str(destination),'w',options={'movflags':'+faststart'}) as out:
    video=src.streams.video[0]
    stream=out.add_stream_from_template(video)
    sound=out.add_stream('aac',rate=rate)
    sound.layout='stereo'
    sound.bit_rate=192000
    for packet in src.demux(video):
        if packet.dts is not None:
            packet.stream=stream
            out.mux(packet)
    for i in range(0,mix.shape[1],1024):
        frame=av.AudioFrame.from_ndarray(np.ascontiguousarray(mix[:,i:i+1024]),format='fltp',layout='stereo')
        frame.sample_rate=rate
        frame.pts=i
        out.mux(sound.encode(frame))
    out.mux(sound.encode(None))
destination.replace(master)
