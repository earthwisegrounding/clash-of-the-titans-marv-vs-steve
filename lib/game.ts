import * as T from 'three';
import {GLTFLoader, type GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {canOccupy, meleeHits, stepToward, type Collider} from './rules.ts';
export type Hud={health:number;stamina:number;kills:number;total:number;district:string;message:string;dead:boolean;won:boolean;paused:boolean;healing:boolean;enemyHealth:number;enemyState:string};
type Actor={root:T.Group;visual:T.Object3D;mixer:T.AnimationMixer;actions:Record<string,T.AnimationAction>;current:string;health:number;timer:number;attackAt:number;hitDone:boolean;dead:boolean;home:T.Vector3;phase:number;district:number;groundTarget:number|null};
export class BremertonGame{
 renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(52,1,.1,500);clock=new T.Clock();mount:HTMLElement;raf=0;disposed=false;loaded=false;active=false;paused=false;muted=false;audio:AudioContext|null=null;
 colliders:Collider[]=[];zombies:Actor[]=[];marv!:Actor;world!:T.Object3D;keys=new Set<string>();joystick=new T.Vector2();running=false;runExhausted=false;yaw=Math.PI;pitch=.28;drag=false;pointerX=0;pointerY=0;health=100;safeTime=0;healing=false;stamina=100;kills=0;lock=0;invulnerable=0;strike=0;strikeType='';jumpVelocity=0;elevation=0;titleDanceIndex=0;titleDanceTime=0;readonly titleDances=['dance1','dance2','dance3'];mobile=matchMedia('(pointer:coarse)').matches;recoil=0;cameraPointer:number|null=null;animationElapsed=new Map<Actor,number>();message='';messageUntil=0;time=0;lastHud=0;shake=0;wonAt=0;deadAt=0;templates:GLTF[]=[];cleanup:(()=>void)[]=[];ring:T.Mesh;particles:{mesh:T.Mesh;v:T.Vector3;life:number}[]=[];
 result:'marv'|'steve'|null=null;resultActors:Actor[]=[];resultDanceIndex=0;resultDanceTime=0;
 constructor(mount:HTMLElement,private status:(s:string)=>void,private hud:(h:Hud)=>void){
  this.mount=mount;this.renderer=new T.WebGLRenderer({antialias:!this.mobile,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.mobile?1.25:1.7));this.renderer.setSize(mount.clientWidth,mount.clientHeight);this.renderer.shadowMap.enabled=!this.mobile;this.renderer.shadowMap.type=T.PCFShadowMap;this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;mount.appendChild(this.renderer.domElement);
  this.scene.background=new T.Color('#809999');this.scene.fog=new T.FogExp2('#809999',.006);
  this.scene.add(new T.HemisphereLight('#bed9dc','#304437',2.5));const sun=new T.DirectionalLight('#ffe5ad',3.1);sun.position.set(-35,55,25);sun.castShadow=!this.mobile;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-65;sun.shadow.camera.right=65;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;sun.shadow.camera.far=160;sun.shadow.normalBias=.035;this.scene.add(sun,sun.target);
  const fill=new T.DirectionalLight('#86c4d2',1.1);fill.position.set(90,20,-60);this.scene.add(fill);
  this.ring=new T.Mesh(new T.RingGeometry(.75,.84,40),new T.MeshBasicMaterial({color:'#e7c267',transparent:true,opacity:.65,side:T.DoubleSide,depthWrite:false}));this.ring.rotation.x=-Math.PI/2;this.scene.add(this.ring);
  this.camera.position.set(9,5,12);this.camera.lookAt(0,1,0);this.bind();this.resize();this.loop();
 }
 async load(){
  const loader=new GLTFLoader();const paths=['bremerton','marv','steve','marv-defeat','steve-defeat'];let done=0;
  const assets=await Promise.all(paths.map(async p=>{const a=await loader.loadAsync(new URL('assets/'+p+'.glb?v=results-1',document.baseURI).href);this.status(`${++done} / 5 assets ready`);return a;}));if(this.disposed){assets.forEach(a=>this.disposeObject(a.scene));return;}
  const layout:any=await fetch(new URL('assets/world.json',document.baseURI)).then(r=>{if(!r.ok)throw Error('World unavailable');return r.json();});if(this.disposed)return;this.colliders=layout.colliders;
  this.world=assets[0].scene;this.world.traverse(o=>{if((o as T.Mesh).isMesh){o.receiveShadow=true;o.castShadow=true;}});this.scene.add(this.world);this.templates=assets.slice(1);
  this.marv=this.actor(this.templates[0],new T.Vector3(0,0,6),-1);this.play(this.marv,this.titleDances[0]);
  this.spawn();this.loaded=true;this.status('The waterfront is ready.');this.emit();
 }
 actor(g:GLTF,pos:T.Vector3,district:number):Actor{
  const visual=clone(g.scene);const root=new T.Group();root.add(visual);root.position.copy(pos);const box=new T.Box3().setFromObject(visual);const height=box.max.y-box.min.y;visual.scale.setScalar(1.85/height);visual.position.y=-box.min.y*(1.85/height);
  visual.traverse(o=>{if((o as T.Mesh).isMesh){o.castShadow=!this.mobile;o.receiveShadow=true;const mesh=o as T.SkinnedMesh;if(mesh.isSkinnedMesh){mesh.computeBoundingSphere();mesh.boundingSphere!.radius*=2.5;}o.frustumCulled=true;}});this.scene.add(root);const mixer=new T.AnimationMixer(visual);const actions:Record<string,T.AnimationAction>={};g.animations.forEach(source=>{const c=source.clone();if(c.name!=='defeat'&&(district===-1||c.name!=='death')){const track=c.tracks.find(t=>t.name==='spine.position');const spine=visual.getObjectByName('spine');if(track&&spine)for(let i=0;i<track.values.length;i+=3){track.values[i]=spine.position.x;track.values[i+2]=spine.position.z;}}actions[c.name]=mixer.clipAction(c);});return {root,visual,mixer,actions,current:'',health:100,timer:0,attackAt:0,hitDone:false,dead:false,home:pos.clone(),phase:Math.random()*6.28,district,groundTarget:null};
 }
 spawn(){
  const a=this.actor(this.templates[1],new T.Vector3(0,0,-2),0);a.health=600;this.zombies=[a];this.play(a,this.active?'walk':'dance1');
 }
 play(a:Actor,name:string,once=false,speed=1){
  if(a.current===name)return;const next=a.actions[name];if(!next)return;const prev=a.actions[a.current];next.reset().setEffectiveTimeScale(speed).setEffectiveWeight(1);next.paused=false;next.setLoop(once?T.LoopOnce:T.LoopRepeat,once?1:Infinity);next.clampWhenFinished=once;next.play();if(prev)next.crossFadeFrom(prev,.16,false);a.current=name;
 }
 start(){if(!this.loaded||this.active)return;this.restart();this.active=true;this.paused=false;this.keys.clear();this.releaseStick();this.marv.mixer.stopAllAction();this.marv.current='';this.play(this.marv,'walk');this.marv.actions.walk.paused=true;this.marv.actions.walk.time=0;this.marv.mixer.update(0);this.marv.root.rotation.y=0;this.resize();this.unlockAudio();this.announce('STEVE IS READY. Dodge the wind-up. Strike after he swings.',5);this.emit();}
 restart(){this.clearResults();this.zombies.forEach(z=>{this.scene.remove(z.root);z.mixer.stopAllAction();z.root.traverse(o=>{if((o as T.SkinnedMesh).isSkinnedMesh)(o as T.SkinnedMesh).skeleton.dispose();});});this.animationElapsed.clear();this.active=true;this.spawn();this.marv.root.position.set(0,0,6);this.marv.root.rotation.set(0,0,0);this.health=100;this.safeTime=0;this.healing=false;this.stamina=100;this.runExhausted=false;this.kills=0;this.wonAt=0;this.deadAt=0;this.lock=0;this.strike=0;this.elevation=0;this.jumpVelocity=0;this.invulnerable=0;this.recoil=0;this.paused=false;this.active=true;this.keys.clear();this.releaseStick();this.cameraPointer=null;this.drag=false;this.marv.mixer.stopAllAction();this.marv.current='';this.play(this.marv,'walk');this.marv.actions.walk.paused=true;this.marv.actions.walk.time=0;this.marv.mixer.update(0);this.announce('MARV VS STEVE · MAKE IT COUNT.',3);this.resize();this.emit();}
 title(){if(!this.loaded)return;this.clearResults();this.keys.clear();this.releaseStick();this.cameraPointer=null;this.drag=false;this.active=false;this.paused=false;this.recoil=0;this.shake=0;this.marv.root.position.set(0,0,6);this.marv.visual.rotation.z=0;this.titleDanceIndex=0;this.titleDanceTime=0;this.marv.mixer.stopAllAction();this.marv.current='';this.play(this.marv,this.titleDances[0]);const steve=this.zombies[0];steve.dead=false;steve.groundTarget=null;steve.root.position.set(1.3,0,6);steve.mixer.stopAllAction();steve.current='';this.play(steve,'dance1');this.resize();}
 pause(){if(!this.active||this.health<=0||this.kills===this.zombies.length)return;this.paused=!this.paused;this.keys.clear();this.releaseStick();this.cameraPointer=null;this.drag=false;this.emit();}
 setMuted(v:boolean){this.muted=v;}
 setRun(v:boolean){this.running=v;}
 stick(x:number,y:number,r:DOMRect){this.joystick.set((x-r.left-r.width/2)/(r.width*.4),-(y-r.top-r.height/2)/(r.height*.4));if(this.joystick.length()>1)this.joystick.normalize();}
 releaseStick(){this.joystick.set(0,0);this.running=false;}
 tickTitle(dt:number){if(this.active)return;this.titleDanceTime+=dt;const clip=this.marv.actions[this.titleDances[this.titleDanceIndex]].getClip();if(this.titleDanceTime>=Math.max(clip.duration,this.zombies[0].actions[this.titleDances[this.titleDanceIndex]].getClip().duration)){this.titleDanceTime=0;this.titleDanceIndex=(this.titleDanceIndex+1)%this.titleDances.length;this.play(this.marv,this.titleDances[this.titleDanceIndex]);}this.marv.root.position.x=-1.3;const steve=this.zombies[0];steve.root.position.set(1.3,0,6);steve.root.rotation.y=-.18;this.play(steve,this.titleDances[this.titleDanceIndex]);steve.mixer.update(dt);this.marv.mixer.update(dt);}
 showResults(winner:'marv'|'steve'){
  if(this.result)return;
  this.result=winner;this.keys.clear();this.releaseStick();this.drag=false;this.cameraPointer=null;
  this.recoil=0;this.shake=0;this.strike=0;this.resultDanceIndex=0;this.resultDanceTime=0;
  this.marv.root.visible=false;this.zombies.forEach(a=>a.root.visible=false);this.ring.visible=false;
  for(const p of this.particles){this.scene.remove(p.mesh);p.mesh.geometry.dispose();(p.mesh.material as T.Material).dispose();}this.particles=[];
  const winningModel=winner==='marv'?0:1,losingModel=1-winningModel;
  this.resultActors=[this.actor(this.templates[winningModel],new T.Vector3(-1.3,0,6),winningModel===0?-1:0),this.actor(this.templates[losingModel+2],new T.Vector3(1.3,0,6),losingModel===0?-1:0)];
  this.play(this.resultActors[0],'dance1');this.play(this.resultActors[1],'defeat');
  this.resultActors.forEach(a=>{a.root.rotation.y=0;a.mixer.update(0);});
  this.resize();const view=this.resultView();this.camera.position.copy(view.position);this.camera.lookAt(view.look);this.emit();
 }
 clearResults(){
  for(const a of this.resultActors||[]){this.scene.remove(a.root);a.mixer.stopAllAction();a.root.traverse(o=>{if((o as T.SkinnedMesh).isSkinnedMesh)(o as T.SkinnedMesh).skeleton.dispose();});}
  this.resultActors=[];this.result=null;if(this.marv)this.marv.root.visible=true;this.zombies.forEach(a=>a.root.visible=true);
 }
 resultView(){return {position:new T.Vector3(0,2.4,6+(this.camera.aspect<.8?11.2:6.8)),look:new T.Vector3(0,1,6)};}
 tickResults(dt:number){
  const [winner,loser]=this.resultActors;this.resultDanceTime+=dt;
  if(this.resultDanceTime>=winner.actions[this.titleDances[this.resultDanceIndex]].getClip().duration){
   this.resultDanceTime=0;this.resultDanceIndex=(this.resultDanceIndex+1)%this.titleDances.length;this.play(winner,this.titleDances[this.resultDanceIndex]);
  }
  winner.mixer.update(dt);loser.mixer.update(dt);
 }
 animateZombie(z:Actor,dt:number){
  const death=z.actions.death;
  // Finish the actual clip before freezing a corpse; wall-clock time is not animation time.
  if(z.dead&&death.paused){
   if(z.groundTarget===null){
    z.root.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(z.root,true);
    z.groundTarget=z.root.position.y+.05-bounds.min.y;
   }
   z.root.position.y=T.MathUtils.damp(z.root.position.y,z.groundTarget,14,dt);
   if(Math.abs(z.root.position.y-z.groundTarget)<.001)z.root.position.y=z.groundTarget;
   return;
  }
  const elapsed=(this.animationElapsed.get(z)||0)+dt;
  const distance=z.root.position.distanceToSquared(this.marv.root.position);
  const interval=this.mobile?(distance>400?.1:distance>100?1/30:0):0;
  if(elapsed>=interval){z.mixer.update(elapsed);this.animationElapsed.set(z,0);}else this.animationElapsed.set(z,elapsed);
 }

 bind(){
  const on=(target:EventTarget,event:string,fn:any)=>{target.addEventListener(event,fn);this.cleanup.push(()=>target.removeEventListener(event,fn));};
  on(this.renderer.domElement,'webglcontextlost',(e:Event)=>{e.preventDefault();this.paused=true;this.keys.clear();this.releaseStick();this.status('Graphics were interrupted. Reload to continue.');this.emit();});
  on(window,'resize',()=>this.resize());on(window,'keydown',(e:KeyboardEvent)=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();this.keys.add(e.code);if(e.repeat)return;if(e.code==='KeyJ')this.attack('punch');if(e.code==='KeyK')this.attack('kick');if(e.code==='Space')this.jump();if(e.code==='Escape')this.pause();});on(window,'keyup',(e:KeyboardEvent)=>this.keys.delete(e.code));on(window,'blur',()=>{this.keys.clear();this.releaseStick();this.cameraPointer=null;this.drag=false;if(this.active&&!this.paused&&this.health>0&&this.kills<this.zombies.length){this.paused=true;this.emit();}});
  on(document,'visibilitychange',()=>{if(document.hidden&&this.active&&this.health>0&&this.kills<this.zombies.length){this.paused=true;this.keys.clear();this.releaseStick();this.cameraPointer=null;this.drag=false;this.emit();}});
  on(this.renderer.domElement,'pointerdown',(e:PointerEvent)=>{if(this.result||!this.active||this.paused||this.cameraPointer!==null)return;this.cameraPointer=e.pointerId;this.drag=true;this.pointerX=e.clientX;this.pointerY=e.clientY;this.renderer.domElement.setPointerCapture(e.pointerId);});
  on(this.renderer.domElement,'pointermove',(e:PointerEvent)=>{if(this.drag&&this.cameraPointer===e.pointerId){this.yaw-=(e.clientX-this.pointerX)*.006;this.pitch=T.MathUtils.clamp(this.pitch+(e.clientY-this.pointerY)*.003,.06,.7);this.pointerX=e.clientX;this.pointerY=e.clientY;}});
  const releaseCamera=(e:PointerEvent)=>{if(this.cameraPointer===e.pointerId){this.drag=false;this.cameraPointer=null;}};
  on(this.renderer.domElement,'pointerup',releaseCamera);on(this.renderer.domElement,'pointercancel',releaseCamera);on(this.renderer.domElement,'lostpointercapture',releaseCamera);on(this.renderer.domElement,'contextmenu',(e:Event)=>e.preventDefault());
 }
 attack(kind:string){if(this.result||!this.active||this.paused||this.health<=0||this.lock>0||this.elevation>.1||this.kills===this.zombies.length)return;const cost=kind==='kick'?24:13;if(this.stamina<cost){this.announce('Catch your breath.',1);return;}this.stamina-=cost;
  const nearby=this.zombies.filter(z=>!z.dead&&z.root.position.distanceTo(this.marv.root.position)<3.3).sort((a,b)=>a.root.position.distanceToSquared(this.marv.root.position)-b.root.position.distanceToSquared(this.marv.root.position))[0];if(nearby){const d=nearby.root.position.clone().sub(this.marv.root.position);this.marv.root.rotation.y=Math.atan2(d.x,d.z);}
  this.lock=kind==='kick'?.85:.72;this.strike=this.lock;this.marv.attackAt=0;this.marv.hitDone=false;this.strikeType=kind;this.play(this.marv,kind,true,kind==='kick'?1.65:2.9);this.sound('swing');
 }
 jump(){if(this.result||!this.active||this.paused||this.health<=0||this.lock>0||this.elevation>0||this.stamina<12)return;this.stamina-=12;this.jumpVelocity=6;this.lock=.65;this.play(this.marv,'jump',true,1.1);this.sound('jump');}
 // Bone-following hitboxes: a strike must touch the animated body, not just its origin.
 contact(attacker:Actor,defender:Actor,kick:boolean){
  if(!meleeHits(attacker.root.position,defender.root.position,attacker.root.rotation.y,1.65))return false;
  // Walls stop melee attacks as well as movement.
  const a=attacker.root.position,b=defender.root.position;
  for(const wall of this.colliders){
   let lo=0,hi=1;
   for(const [start,end,center,size] of [[a.x,b.x,wall.x,wall.w],[a.z,b.z,wall.z,wall.d]]){
    const delta=end-start,min=center-size/2,max=center+size/2;
    if(Math.abs(delta)<1e-8){if(start<min||start>max){hi=-1;break;}}
    else{const t1=(min-start)/delta,t2=(max-start)/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
   }
   if(lo<=hi)return false;
  }
  attacker.root.updateMatrixWorld(true);defender.root.updateMatrixWorld(true);
  const point=(actor:Actor,name:string)=>actor.visual.getObjectByName(name)?.getWorldPosition(new T.Vector3());
  const targets:[string,string,number][]=[['spine','spine003',.20],['spine004','spine005',.15],['upper_armL','forearmL',.10],['forearmL','handL',.09],['upper_armR','forearmR',.10],['forearmR','handR',.09],['thighL','shinL',.13],['shinL','footL',.10],['thighR','shinR',.13],['shinR','footR',.10]];
  const limbs=kick?['footR','toeR']:['handL','handR'];
  for(const name of limbs){
   const p=point(attacker,name);if(!p)continue;
   for(const [start,end,radius] of targets){
    const x=point(defender,start),y=point(defender,end);if(!x||!y)continue;
    const closest=new T.Line3(x,y).closestPointToPoint(p,true,new T.Vector3());
    if(p.distanceToSquared(closest)<=(radius+(kick?.12:.11))**2)return true;
   }
  }
  return false;
 }
 hit(){const p=this.marv.root.position;let count=0;for(const z of this.zombies){if(z.dead||!this.contact(this.marv,z,this.strikeType==='kick'))continue;this.marv.hitDone=true;if(z.current==='block'&&z.timer>0){this.burst(z.root.position.clone().add(new T.Vector3(0,1.3,0)),'#78dced');this.announce('STEVE BLOCKED · Wait for his swing.',1.2);this.sound('swing');continue;}z.health-=this.strikeType==='kick'?62:38;count++;this.burst(z.root.position.clone().add(new T.Vector3(0,1.3,0)),'#d7bb72');this.move(z.root,z.root.position.clone().sub(p).normalize().multiplyScalar(this.strikeType==='kick'?.65:.22),.5);if(z.health<=0){z.dead=true;z.timer=0;this.play(z,'death',true);this.kills++;this.announce('STEVE IS DOWN. MARV STANDS TALL.',2);this.sound('kill');} }
  if(count){this.shake=.15;this.sound('punch');}if(this.kills===this.zombies.length){this.wonAt=this.time;this.announce('MARV WINS THE CLASH.',20);this.lock=0;}
 }
 // Substeps prevent sprinting or knockback from tunneling through a body.
 move(root:T.Object3D,delta:T.Vector3,r=.42){
  const p=root.position,steps=Math.max(1,Math.ceil(Math.hypot(delta.x,delta.z)/.025));
  const bodies=[this.marv,...this.zombies].filter(a=>a.root!==root&&!a.dead&&(a!==this.marv||this.health>0));
  const radius=.30;
  const clear=(x:number,z:number)=>canOccupy(x,z,r,this.colliders)&&bodies.every(a=>{
   const q=a.root.position,limit=radius+.30;
   const next=Math.hypot(x-q.x,z-q.z),current=Math.hypot(p.x-q.x,p.z-q.z);
   return next>=limit-1e-8||(current<limit&&next>current+1e-8);
  });
  for(let i=0;i<steps;i++){if(clear(p.x+delta.x/steps,p.z))p.x+=delta.x/steps;if(clear(p.x,p.z+delta.z/steps))p.z+=delta.z/steps;}
 }
 tick(dt:number){
  if(this.result||!this.active||this.paused)return;
  // Sample fast animated strikes at 120 Hz, including when rendering slows down.
  if(dt>1/120+1e-9){const steps=Math.ceil(dt*120);for(let i=0;i<steps;i++)this.tick(dt/steps);return;}
  this.time+=dt;this.recoil=Math.max(0,this.recoil-dt);this.invulnerable=Math.max(0,this.invulnerable-dt);this.lock=Math.max(0,this.lock-dt);this.shake=Math.max(0,this.shake-dt);
  if(this.strike>0){this.strike=Math.max(0,this.strike-dt);this.marv.attackAt+=dt;}
  if(this.health>0){let x=(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0)+this.joystick.x;let y=(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0)-(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0)+this.joystick.y;const moving=Math.hypot(x,y)>.12;// After exhaustion, recover a useful reserve before allowing another sprint.
   if(this.stamina<=0)this.runExhausted=true;
   else if(this.stamina>=25)this.runExhausted=false;
   let run=moving&&(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')||this.running)&&!this.runExhausted&&this.lock<=0;
   this.stamina=T.MathUtils.clamp(this.stamina+(run?-19:15)*dt,0,100);
   if(run&&this.stamina===0){this.runExhausted=true;run=false;}
   if(moving&&this.lock<=0){const delta=new T.Vector3(-Math.sin(this.yaw)*y+Math.cos(this.yaw)*x,0,-Math.cos(this.yaw)*y-Math.sin(this.yaw)*x).normalize();this.move(this.marv.root,delta.multiplyScalar((run?6:2.8)*dt));this.marv.root.rotation.y=Math.atan2(delta.x,delta.z);if(this.elevation===0){this.play(this.marv,run?'run':'walk');this.marv.actions[this.marv.current].paused=false;}}
   else if(this.lock<=0&&this.elevation===0){this.play(this.marv,'walk');this.marv.actions.walk.paused=true;this.marv.actions.walk.time=0;}
   if(this.elevation>0||this.jumpVelocity>0){this.elevation=Math.max(0,this.elevation+this.jumpVelocity*dt);this.jumpVelocity-=16*dt;if(this.elevation===0)this.jumpVelocity=0;this.marv.root.position.y=this.elevation;}
  }
  this.marv.mixer.update(dt);
  for(const z of this.zombies){
   this.animateZombie(z,dt);if(z.dead){z.timer+=dt;continue;}if(this.health<=0){this.play(z,'dance2');continue;}
   z.timer=Math.max(0,z.timer-dt);
   const d=Math.hypot(z.root.position.x-this.marv.root.position.x,z.root.position.z-this.marv.root.position.z);
   if(z.current==='attack'&&z.timer>0){
    if(!z.hitDone&&z.timer<1.37&&z.timer>.45){
     if(this.contact(z,this.marv,false)&&this.invulnerable===0){
      z.hitDone=true;this.burst(this.marv.root.position.clone().add(new T.Vector3(0,1.2,0)),'#ed7965');
      this.health=Math.max(0,this.health-22);if(this.health<=0)this.deadAt=this.time;
      this.invulnerable=1.1;this.shake=.3;this.strike=0;this.play(this.marv,this.health<=0?'death':'hit',true,this.health<=0?1:3.5);this.lock=this.health<=0?99:.55;this.sound('hurt');this.announce(this.health<=0?'Marv is down.':'STEVE CONNECTS · −22 GRIT',1.3);
     }
    }continue;
   }
   if(z.current==='block'&&z.timer>0)continue;
   if(d<.76&&z.timer<=0){
    z.root.rotation.y=Math.atan2(this.marv.root.position.x-z.root.position.x,this.marv.root.position.z-z.root.position.z);
    if(z.current!=='block'&&Math.sin(this.time*1.7)>0.45){this.play(z,'block',true);z.timer=.85;}
    else{z.current='';this.play(z,'attack',true,z.actions.attack.getClip().duration/1.65);z.timer=1.65;z.hitDone=false;this.announce('STEVE WINDS UP · Jump or back away!',1);}
   }else{
    const sprint=d>7;this.play(z,sprint?'run':'walk');
    const delta=stepToward(z.root.position,this.marv.root.position,dt*(sprint?4:1.9),this.colliders,.48);
    if(delta.x||delta.z){this.move(z.root,new T.Vector3(delta.x,0,delta.z),.48);z.root.rotation.y=Math.atan2(delta.x,delta.z);}
   }
  }
  if(this.strike>0&&!this.marv.hitDone&&this.health>0){
   const age=this.marv.attackAt;
   if(this.strikeType==='kick'?age>=.22&&age<=.58:age>=.08&&age<=.62)this.hit();
  }
  const threatened=this.zombies.some(z=>!z.dead&&Math.hypot(z.root.position.x-this.marv.root.position.x,z.root.position.z-this.marv.root.position.z)<=6);
  const previousSafeTime=this.safeTime;
  this.safeTime=threatened||this.health<=0?0:this.safeTime+dt;
  this.healing=this.health>0&&this.health<100&&this.safeTime>5;
  if(this.healing)this.health=Math.min(100,this.health+5*(Math.max(0,this.safeTime-5)-Math.max(0,previousSafeTime-5)));

 }
 loop=()=>{if(this.disposed)return;this.raf=requestAnimationFrame(this.loop);const dt=Math.min(this.clock.getDelta(),.05);if(document.hidden)return;if(this.loaded){if(!this.result&&this.active){if(this.health<=0&&this.time-this.deadAt>2.9)this.showResults('steve');else if(this.kills===this.zombies.length&&this.time-this.wonAt>4)this.showResults('marv');}if(this.result)this.tickResults(dt);else if(this.active&&!this.paused)this.tick(dt);else if(!this.active){this.tickTitle(dt);}
   for(const z of this.zombies)z.root.visible=!this.result;
   const p=this.marv.root.position;this.ring.position.set(p.x,.07,p.z);this.ring.visible=this.active&&this.health>0&&!this.result;
   let target:T.Vector3,look:T.Vector3;if(this.result){const view=this.resultView();target=view.position;look=view.look;}else if(this.active){const distance=6.5;target=new T.Vector3(p.x+Math.sin(this.yaw)*distance,p.y+2.2+this.pitch*5,p.z+Math.cos(this.yaw)*distance);look=p.clone().add(new T.Vector3(0,1.25,0));
    // Pull camera in when its ground projection would enter a building.
    for(let t=.15;t<=1;t+=.05){const c=look.clone().lerp(target,t);if(this.colliders.some(b=>Math.abs(c.x-b.x)<b.w/2+.3&&Math.abs(c.z-b.z)<b.d/2+.3)){target=look.clone().lerp(target,Math.max(.15,t-.1));target.y=Math.max(target.y,p.y+2.4);break;}}
   }else{const portrait=this.camera.aspect<.8;target=new T.Vector3(0,2.4,6+(portrait?9.8:8.4));look=new T.Vector3(0,1,6);this.marv.root.rotation.y=.23;}
   this.camera.position.lerp(target,1-Math.exp(-dt*7));if(this.shake>0)this.camera.position.add(new T.Vector3((Math.random()-.5)*this.shake,(Math.random()-.5)*this.shake,0));this.camera.lookAt(look);this.marv.visual.rotation.z=this.recoil>0?Math.sin(this.recoil*24)*this.recoil*.22:0;
   for(let i=this.particles.length-1;i>=0;i--){const e=this.particles[i];if(!this.paused){e.life-=dt;e.mesh.position.addScaledVector(e.v,dt);e.v.y-=5*dt;(e.mesh.material as T.MeshBasicMaterial).opacity=Math.max(0,e.life*2);}if(e.life<=0){this.scene.remove(e.mesh);e.mesh.geometry.dispose();(e.mesh.material as T.Material).dispose();this.particles.splice(i,1);}}
   if(this.time-this.lastHud>.1){this.emit();this.drawMap();this.lastHud=this.time;}
  }this.renderer.render(this.scene,this.camera);
 }
 emit(){const p=this.marv?.root.position;this.hud({health:this.health,stamina:this.stamina,kills:this.kills,total:1,enemyHealth:Math.max(0,this.zombies[0]?.health??600),enemyState:this.zombies[0]?.dead?'DEFEATED':this.zombies[0]?.current==='attack'?'WIND-UP / STRIKE':this.zombies[0]?.current==='block'?'BLOCKING':'CLOSING IN',district:p&&p.x>45?(p.z>0?'Ferry Terminal':'Harborside'):'Downtown',message:this.time<this.messageUntil?this.message:'',dead:this.result==='steve',won:this.result==='marv',paused:this.paused,healing:this.healing});}
 announce(s:string,seconds:number){this.message=s;this.messageUntil=this.time+seconds;}
 drawMap(){const c=document.querySelector<HTMLCanvasElement>('#minimap');if(!c)return;const g=c.getContext('2d');if(!g)return;g.clearRect(0,0,200,200);g.fillStyle='#14272a';g.fillRect(0,0,200,200);g.fillStyle='#3a5250';for(const b of this.colliders)g.fillRect(100+b.x-b.w/2,100+b.z-b.d/2,b.w,b.d);g.fillStyle='#376369';g.fillRect(187,0,13,200);for(const z of this.zombies){if(z.dead)continue;g.fillStyle=z.current==='attack'?'#ffb85f':'#e0826b';g.beginPath();g.arc(100+z.root.position.x,100+z.root.position.z,2.5,0,7);g.fill();}g.save();g.translate(100+this.marv.root.position.x,100+this.marv.root.position.z);g.rotate(-this.marv.root.rotation.y);g.fillStyle='#f3d173';g.beginPath();g.moveTo(0,5);g.lineTo(-3,-3);g.lineTo(3,-3);g.fill();g.restore();g.fillStyle='#dae0c8';g.font='11px monospace';g.fillText('N',7,14);}
 burst(p:T.Vector3,color:string){for(let i=0;i<9;i++){const mesh=new T.Mesh(new T.BoxGeometry(.055,.055,.055),new T.MeshBasicMaterial({color,transparent:true}));mesh.position.copy(p);this.scene.add(mesh);this.particles.push({mesh,v:new T.Vector3((Math.random()-.5)*4,Math.random()*3,(Math.random()-.5)*4),life:.4+Math.random()*.25});}}
 unlockAudio(){try{this.audio??=new AudioContext();void this.audio.resume();}catch{}}
 sound(kind:string){if(this.muted||!this.audio)return;const a=this.audio;const osc=a.createOscillator(),gain=a.createGain();const values:Record<string,number[]>={punch:[100,35,.12,.18],swing:[220,70,.09,.025],kill:[160,55,.3,.1],hurt:[70,25,.22,.12],jump:[150,260,.12,.035],scream:[230,75,.7,.025]};const [f,to,duration,vol]=values[kind]||values.punch;osc.type=kind==='scream'?'sawtooth':'triangle';osc.frequency.setValueAtTime(f,a.currentTime);osc.frequency.exponentialRampToValueAtTime(to,a.currentTime+duration);gain.gain.setValueAtTime(vol,a.currentTime);gain.gain.exponentialRampToValueAtTime(.001,a.currentTime+duration);osc.connect(gain);gain.connect(a.destination);osc.start();osc.stop(a.currentTime+duration);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
 resize(){const w=this.mount.clientWidth,h=this.mount.clientHeight;this.camera.aspect=w/h;this.camera.clearViewOffset();if(this.result){if(w/h<.8)this.camera.setViewOffset(w,h,0,h*.08,w,h);}else if(!this.active){if(w/h<.8)this.camera.setViewOffset(w,h,0,h*.20,w,h);else this.camera.setViewOffset(w,h,-w*.23,0,w,h);}this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);}
 disposeObject(root:T.Object3D){root.traverse(o=>{if((o as T.Mesh).isMesh){const m=o as T.Mesh;m.geometry.dispose();for(const material of Array.isArray(m.material)?m.material:[m.material]){for(const v of Object.values(material))if(v instanceof T.Texture)v.dispose();material.dispose();}}});}
 dispose(){this.disposed=true;cancelAnimationFrame(this.raf);this.cleanup.forEach(f=>f());this.disposeObject(this.scene);this.renderer.dispose();this.renderer.domElement.remove();void this.audio?.close();}
}
