import { QuadraticBezierCurve3 } from 'three';
import { MERCHANT_DISTANCES } from '../data/merchant.js';
import { STARMAP_PORT_IDS } from './StarmapLayout.js';

export const starmapEdgeKey=(from,to)=>[from,to].sort().join(':');

// 曲线按港口顺序固定；往返共用一条曲线，进度与方向均来自真实航次。
export function buildStarmapRouteGraph(docks,positions,routes=[],openedPortIds=null){
  const edges=new Map();
  function add(a,b,source='merchant'){
    if(a===b||!positions.has(a)||!positions.has(b))return;
    const key=starmapEdgeKey(a,b);
    if(edges.has(key))return;
    const ordered=[a,b].sort((x,y)=>STARMAP_PORT_IDS.indexOf(x)-STARMAP_PORT_IDS.indexOf(y));
    const [fromId,toId]=ordered,from=(docks.get(fromId)||positions.get(fromId)).clone(),to=(docks.get(toId)||positions.get(toId)).clone();
    from.z=to.z=.8;
    const mid=from.clone().lerp(to,.5);
    const bend={'mineral_belt:sol_prime':.85,'mineral_belt:nebula_forge':.35,'aurora_depot:nebula_forge':-.65,'aurora_depot:sol_prime':-.48,'nebula_forge:sol_prime':-.65};
    mid.y+=bend[key]??.25;
    edges.set(key,{key,fromId,toId,source,curve:new QuadraticBezierCurve3(from,mid,to)});
  }
  for(const key of Object.keys(MERCHANT_DISTANCES)){
    const [a,b]=key.split(':');
    // 未开港的探索泊位只供实际探索航次使用，不提前连通贸易航线。
    if(docks.has(a)&&docks.has(b)&&(!openedPortIds||openedPortIds.has(a)&&openedPortIds.has(b)))add(a,b);
  }
  for(const route of routes)add(route.startSystemId,route.endSystemId,route.source);
  return edges;
}
export function sampleStarmapRoute(edge,route,position,direction){
  const reverse=route.startSystemId!==edge.fromId;
  const progress=Math.max(0,Math.min(1,Number(route.progress)||0));
  edge.curve.getPoint(reverse?1-progress:progress,position);
  edge.curve.getTangent(reverse?1-progress:progress,direction);
  if(reverse)direction.negate();
}
