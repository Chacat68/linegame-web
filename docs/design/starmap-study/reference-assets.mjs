// 原图仅作为 CPU 端缓存；每次创建场景都会生成自己拥有的 GPU 纹理。
const urls={
  earth:new URL('./reference-assets/earth_day_4096.jpg',import.meta.url).href,
  clouds:new URL('./reference-assets/earth_clouds_1024.png',import.meta.url).href,
  water:new URL('./reference-assets/earth_specular_2048.jpg',import.meta.url).href,
  moon:new URL('./reference-assets/moon_1024.jpg',import.meta.url).href,
  sky:new URL('./reference-assets/nebula-reference-v1.jpg',import.meta.url).href,
};
let prepared=null;
export function prepareReferenceAssets(){
  if(!prepared)prepared=Promise.all(Object.entries(urls).map(([key,url])=>new Promise((resolve,reject)=>{
    const image=new Image();image.decoding='async';
    image.onload=()=>resolve([key,image]);image.onerror=()=>reject(new Error('无法加载场景纹理：'+key));image.src=url;
  }))).then(entries=>Object.fromEntries(entries)).catch(error=>{prepared=null;throw error;});
  return prepared;
}
