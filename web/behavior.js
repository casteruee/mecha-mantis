import { behavior as captureStrike } from './capture-strike.js';
const spec = (await (await fetch(new URL('../film/landscape.json', import.meta.url))).json()).life;
function ease(x) {
  const u = Math.max(0, Math.min(1, x));
  return u*u*u*(10+u*(-15+6*u));
}
function sample(keys,t) {
  for (let i=1;i<keys.length;i++) {
    const [a,v]=keys[i-1], [b,w]=keys[i];
    if(t<=b) return v+(w-v)*ease((t-a)/(b-a));
  }
  return keys.at(-1)[1];
}
const wrap=t=>((t%spec.period)+spec.period)%spec.period;
const gaze=t=>sample(spec.gaze,wrap(t));
export function behavior(t,film=false) {
  // Attention shifts over seconds. Shoulders lead the curved wipe; tibiae and antennae
  // trail, with short holds at contact. The recoil overshoots by less than five percent.
  const [a,b,c,d]=spec.calm;
  const gain=film ? 1-ease((t-a)/(b-a))*(1-ease((t-c)/(d-c))) : 1;
  const neck=.25*(gaze(t-spec.neckLag[0])+gaze(t-spec.neckLag[1]))*.5*gain;
  const result={neck,yaw:gaze(t)*gain-neck,weight:sample(spec.weight,wrap(t))*gain,
    breath:(.5-.5*Math.cos(t*2*Math.PI/spec.breathPeriod))*gain,arms:[]};
  for(const [i,side] of [1,-1].entries()){
    const action=(schedule,keys)=>schedule.filter(e=>e[1]===side)
      .reduce((sum,[start])=>sum+sample(keys,wrap(t-start)),0)*gain;
    const lift=action(spec.grooms,spec.groomKeys), wipe=action(spec.grooms,spec.wipeKeys);
    const jab=action(spec.snaps,spec.snapKeys);
    const guard=sample([[0,.18],[1.3,.8],[2.8,.63],[4.3,0],[5.8,.88],[7.2,.35],[8.6,.18]],wrap(t+i*2.3)%8.6)*gain;
    result.arms.push({lift,wipe,jab,guard,
      shoulder:-.30*lift-.16*guard+.10*jab,
      elbow:-.24*lift-.17*guard+.12*jab,
      fold:-.27-.31*guard+.18*wipe-.62*jab,
      swivel:side*(.25+.33*lift+.22*guard),
      lag:(gaze(t-spec.lag[i])-gaze(t))*gain});
  }
  // Blend each arm into the approved three-second display on its own cue.
  for(const [index,side] of [1,-1].entries()){
    const local=t-(side>0?.78:1.36);
    const mix=ease((local+.32)/.32)*(1-ease((local-2.94)/.38));
    const lift=sample([[0,0],[.12,0],[.58,1],[2.42,1],[2.95,0]],local);
    const spread=sample([[0,0],[.24,0],[.70,1],[2.48,1],[2.95,0]],local);
    const pose={lift,wipe:0,jab:0,guard:spread,shoulder:-.06-.38*lift,
      elbow:.04-.24*spread,swivel:side*(.39+.30*lift),fold:.32-.96*spread};
    for(const [key,value] of Object.entries(pose)){
      const a=result.arms[index]; a[key]+=(value-a[key])*mix;
    }
  }
  if(film && t>=12.9){
    const blend=ease((t-12.9)/.70);
    const capture=captureStrike(.76+(t-13.05)*3/16);
    for(const key of ['weight','breath','yaw','neck']) result[key]+=(capture[key]-result[key])*blend;
    result.arms.forEach((a,i)=>{
      for(const key of Object.keys(a)) a[key]+=(capture.arms[i][key]-a[key])*blend;
    });
  }
  result.weight=.16*Math.sin(t*1.4); result.neck=.04*ease((t-1.8)/.65);
  for(const [i,a] of result.arms.entries()){
    const reach=i===0 ? ease((t-1.04)/1.30)-ease((t-3.36)/1.22) : 0;
    Object.assign(a,{shoulder:-.10-.54*reach,elbow:-.06-.26*reach,
      fold:-.29+.36*reach,swivel:(i===0?1:-1)*(.37+.09*reach),wipe:0,guard:.24+.33*reach});
  }
  const strikeBlend=ease((t-5.35)/.85)*(1-ease((t-8.10)/.70));
  if(strikeBlend>0){
    const strikePose=captureStrike(.95+(t-6.55)*3/16);
    result.arms.forEach((a,i)=>{
      for(const key of Object.keys(a))a[key]+=(strikePose.arms[i][key]-a[key])*strikeBlend;
    });
  }
  return result;
}
