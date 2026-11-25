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
// Physical time (s). The tibia holds its opening while the proximal joints thrust.
const shoulder=[[0,-.12],[.45,-.12],[.89,-.28],[.95,-.28],[1.016,-.59],[1.033,-1.20],[1.055,-1.20],[1.23,-.42],[1.48,-.16]];
const femur=[[0,.03],[.46,.03],[.90,-.12],[.95,-.12],[1.016,.08],[1.033,1.89],[1.056,1.89],[1.23,.69],[1.52,.08]];
const tibia=[[0,.31],[.48,.31],[.89,.43],[.95,.43],[1.016,-1.34],[1.033,-1.34],[1.055,.42],[1.34,.42],[1.60,.31]];
export function behavior(t){
  const arms=[1,-1].map((side,i)=>{
    const u=t-i*.002;
    return {shoulder:sample(shoulder,u),elbow:sample(femur,u),fold:sample(tibia,u),
      swivel:side*sample([[0,.16],[.9,.105],[1.016,.105],[1.033,-.05],[1.07,-.05],[1.45,.16]],u),
      lift:0,jab:0,wipe:0,guard:.09,lag:0};
  });
  return {arms,neck:0,yaw:sample([[0,.10],[.68,0],[1.4,0],[1.8,.035]],t),
    weight:0,breath:.23};
}
