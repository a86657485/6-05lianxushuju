import numpy as np, wave, json, math
SR=44100; DUR=22; t=np.arange(int(SR*DUR))/SR
meta=json.load(open('meta.json')); cross=meta['firstCross']
def smooth(x): x=np.clip(x,0,1); return x*x*(3-2*x)
def level(t):
    base=37.5+0.8*np.sin(t*1.7)+0.5*np.sin(t*4.1)
    ramp=29*smooth((t-2.5)/12); fade=np.where(t>17,smooth((t-17)/3.5),0)
    beat=1.6*np.maximum(0,np.sin(t*np.pi*4))+1.1*np.sin(t*2.3)
    L=base+(ramp+beat*smooth((t-2.5)/2))*(1-fade)
    return np.where(t<2.5,base,L)
L=level(t)
music_gain=np.where(t<2.3,0,10**((L-67)/20))*smooth((t-2.3)/0.4)
bpm=120; beat=60/bpm
out=np.zeros_like(t)
# kick + hat
for k in np.arange(2.5,DUR,beat):
    i=int(k*SR); n=int(0.35*SR); tt=np.arange(n)/SR
    seg=np.sin(2*np.pi*(55+90*np.exp(-tt*25))*tt)*np.exp(-tt*9)
    out[i:i+n]+=0.9*seg[:len(out[i:i+n])]
    j=int((k+beat/2)*SR); m=int(0.06*SR)
    hat=np.random.default_rng(int(k*100)).standard_normal(m)*np.exp(-np.arange(m)/SR*60)
    out[j:j+m]+=0.18*hat[:len(out[j:j+m])]
# 五声音阶旋律 + 低音
scale=[392,440,523.25,587.33,659.25,587.33,523.25,440]
mel=[0,2,4,5,4,2,3,1, 0,2,4,6,5,4,2,0]
for idx,k in enumerate(np.arange(2.5,DUR,beat/2)):
    f=scale[mel[idx%len(mel)]]; i=int(k*SR); n=int(beat/2*SR); tt=np.arange(n)/SR
    env=np.minimum(1,tt*80)*np.exp(-tt*4)
    tone=(np.sin(2*np.pi*f*tt)+0.35*np.sin(2*np.pi*2*f*tt)+0.15*np.sin(2*np.pi*3*f*tt))*env
    out[i:i+n]+=0.32*tone[:len(out[i:i+n])]
for idx,k in enumerate(np.arange(2.5,DUR,beat*2)):
    f=[98,110,130.8,98][idx%4]; i=int(k*SR); n=int(beat*2*SR); tt=np.arange(n)/SR
    out[i:i+n]+=0.35*(np.sin(2*np.pi*f*tt)*np.exp(-tt*1.5))[:len(out[i:i+n])]
out*=music_gain
# 夜晚虫鸣（全程很轻）
cr=np.sin(2*np.pi*4200*t)*(0.5+0.5*np.sign(np.sin(2*np.pi*28*t)))*(np.sin(2*np.pi*0.9*t)>0.3)
out+=0.012*cr
# 提醒音
for d in (0,0.28):
    i=int((cross+d)*SR); n=int(0.18*SR); tt=np.arange(n)/SR
    out[i:i+n]+=0.45*np.sin(2*np.pi*1320*tt)*np.minimum(1,tt*200)*np.minimum(1,(0.18-tt)*200)
out=out/np.max(np.abs(out))*0.85
with wave.open('audio.wav','wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out*32767).astype(np.int16).tobytes())
print('ok', cross)
