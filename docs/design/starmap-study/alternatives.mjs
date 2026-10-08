// Art-direction preview only. It never loads or modifies game state.
const directions = {
  miniature: {
    title:'微缩航运沙盘',
    note:'强调立体模型、港口建筑和经营感。实时 3D 需要制作简化模型并烘焙细节；也可使用预渲染港口素材。',
    labels:[[.345,.083],[.79,.46],[.68,.417],[.21,.47]],
  },
  cinematic: {
    title:'电影感星际航路',
    note:'强调天体质感与太空纵深。建议用分层预渲染港口、实时航线与飞船实现；手机重新安排港口位置。',
    labels:[[.359,.146],[.765,.12],[.68,.47],[.196,.494]],
  },
  illustrated: {
    title:'手绘星际商圈',
    note:'强调统一插画风格和港口剪影。可以使用分层港口图集与少量实时动画，适合固定视角星图。',
    labels:[[.36,.15],[.775,.103],[.683,.466],[.28,.48]],
  },
};
const ports=[
  {name:'金穗农业星',type:'agricultural',badge:'农业'},
  {name:'黑金矿星',type:'mining',badge:'矿业'},
  {name:'百炼工业星',type:'industrial',badge:'工业'},
  {name:'聚宝原料星',type:'mining',badge:'原料'},
];
const image=document.querySelector('#scene-art');
const map=document.querySelector('#map-container');
const select=document.querySelector('#art-style');
const layer=document.querySelector('#labels');
const modal=document.querySelector('#settings-modal');
const closeButton=document.querySelector('#close-demo-settings');
let direction='cinematic';
const labels=ports.map((port,index)=>{
  const button=document.createElement('button');
  button.type='button';button.className='port-label';button.dataset.type=port.type;
  button.innerHTML=`<strong>${port.name}</strong><span class="port-type">${port.badge}</span>`;
  button.setAttribute('aria-pressed',String(index===0));
  button.addEventListener('click',()=>labels.forEach((label,i)=>label.setAttribute('aria-pressed',String(i===index))));
  layer.append(button);return button;
});
function positionLabels(){
  if(!image.naturalWidth)return;
  const ratio=Math.min(map.clientWidth/image.naturalWidth,map.clientHeight/image.naturalHeight);
  const width=image.naturalWidth*ratio,height=image.naturalHeight*ratio;
  const offsetX=(map.clientWidth-width)/2,offsetY=(map.clientHeight-height)/2;
  directions[direction].labels.forEach(([x,y],index)=>{
    const half=labels[index].offsetWidth/2;
    labels[index].style.left=`${Math.max(half+8,Math.min(map.clientWidth-half-8,offsetX+x*width))}px`;
    labels[index].style.top=`${offsetY+y*height}px`;
  });
}
function chooseDirection(value){
  direction=Object.hasOwn(directions,value)?value:'cinematic';
  select.value=direction;
  image.alt=`${directions[direction].title}：四港星图场景方向稿`;
  image.src=`./alternatives/${direction}.jpg`;
  document.querySelector('#direction-note').textContent=directions[direction].note;
  const url=new URL(location.href);url.searchParams.set('style',direction);history.replaceState(null,'',url);
  positionLabels();
}
function closeModal(){
  modal.classList.add('hidden');modal.inert=true;modal.setAttribute('aria-hidden','true');
  document.querySelector('#company-tools summary').focus();
}
document.querySelector('#demo-settings').addEventListener('click',()=>{
  document.querySelector('#company-tools').open=false;
  modal.classList.remove('hidden');modal.inert=false;modal.setAttribute('aria-hidden','false');closeButton.focus();
});
closeButton.addEventListener('click',closeModal);
modal.addEventListener('click',event=>{if(event.target===modal)closeModal();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.inert)closeModal();});
document.querySelector('#overview').addEventListener('click',positionLabels);
select.addEventListener('change',event=>chooseDirection(event.target.value));
image.addEventListener('load',positionLabels);
new ResizeObserver(positionLabels).observe(map);
chooseDirection(new URL(location.href).searchParams.get('style'));
