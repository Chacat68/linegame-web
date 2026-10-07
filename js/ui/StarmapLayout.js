// 正式星图与美术预览共用比例和构图；只影响显示，不参与商路距离或计时。
export const STARMAP_PORT_IDS=Object.freeze(['sol_prime','mineral_belt','nebula_forge','aurora_depot']);
export function getLowPolyStarmapLayout(width,height){
  const narrow=width<700;
  const points=narrow?[[.29,.25],[.74,.44],[.31,.64],[.73,.79]]:[[.34,.34],[.77,.34],[.68,.73],[.22,.74]];
  return{
    ports:new Map(STARMAP_PORT_IDS.map((id,i)=>[id,{x:points[i][0]*width,y:points[i][1]*height}])),
    planetRadius:narrow?44:Math.min(88,width*.069),
    sun:{x:width*(narrow?.67:.145),y:height*(narrow?.12:.185),radius:narrow?38:60},
  };
}
