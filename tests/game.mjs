import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

await fs.mkdir('.test-work',{recursive:true});
for(const name of ['game','rules']){
 let source=await fs.readFile(`lib/${name}.ts`,'utf8');
 source=source.replace("'./rules.ts'","'./rules.mjs'");
 await fs.writeFile(`.test-work/${name}.mjs`,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
}
const {BremertonGame}=await import('../.test-work/game.mjs');
const {canOccupy,meleeHits,stepToward}=await import('../.test-work/rules.mjs');
// Keep all real meshes, skeletons and animation data; omit textures for this non-browser test.
async function loadModel(name){
 const data=await fs.readFile(`public/assets/${name}.glb`);
 const length=data.readUInt32LE(12),g=JSON.parse(data.subarray(20,20+length).toString());
 const binary=data.subarray(20+length+8);
 for(const mesh of g.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 delete g.images;delete g.textures;delete g.materials;
 const json=Buffer.from(JSON.stringify(g));const padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
 const result=Buffer.alloc(12+8+padded.length+8+binary.length);
 result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(padded.length,12);result.writeUInt32LE(0x4e4f534a,16);padded.copy(result,20);result.writeUInt32LE(binary.length,20+padded.length);result.writeUInt32LE(0x004e4942,24+padded.length);binary.copy(result,28+padded.length);
 const model=await new GLTFLoader().parseAsync(result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength),'');
 assert(model.animations.every(c=>c.duration>0&&c.tracks.every(t=>Array.from(t.values).every(Number.isFinite))),`${name} animation data`);
 return model;
}
const templates=await Promise.all(['marv','steve'].map(loadModel));
assert.deepEqual(templates[0].animations.map(c=>c.name).sort(),['walk','run','punch','kick','jump','death','hit','dance1','dance2','dance3'].sort());
for(const model of templates.slice(1))assert.deepEqual(model.animations.map(c=>c.name).sort(),['attack','block','dance1','dance2','dance3','death','run','walk']);
function createGame(){
 const g=Object.create(BremertonGame.prototype);
 Object.assign(g,{scene:new T.Scene(),camera:new T.PerspectiveCamera(52,1,.1,500),mount:{clientWidth:1280,clientHeight:800},renderer:{setSize(){}},templates,mobile:true,active:false,paused:false,loaded:true,keys:new Set(),joystick:new T.Vector2(),running:false,yaw:Math.PI,pitch:.28,health:100,stamina:100,kills:0,lock:0,invulnerable:0,strike:0,strikeType:'',jumpVelocity:0,elevation:0,recoil:0,time:0,shake:0,wonAt:0,deadAt:0,message:'',messageUntil:0,titleDanceIndex:0,titleDanceTime:0,titleDances:['dance1','dance2','dance3'],animationElapsed:new Map(),colliders:[],zombies:[],particles:[],sound(){},burst(){},unlockAudio(){},hud(){},status(){}});
 g.marv=g.actor(templates[0],new T.Vector3(0,0,6),-1);g.play(g.marv,'dance1');g.spawn();return g;
}

const g=createGame();assert.equal(g.zombies.length,1);assert.equal(g.zombies[0].health,600);
const seen=[];for(let i=0;i<4;i++){g.tickTitle(.01);seen.push(g.zombies[0].current);const duration=Math.max(g.marv.actions[g.marv.current].getClip().duration,g.zombies[0].actions[g.zombies[0].current].getClip().duration);for(let t=0;t<duration+.025;t+=.025)g.tickTitle(.025);}
assert.deepEqual(seen,['dance1','dance2','dance3','dance1']);
g.start();assert.equal(g.marv.current,'walk');assert.equal(g.zombies[0].current,'walk');assert.equal(g.health,100);
// Stage actual animated contact, rather than directly awarding a radius-based hit.
function strikePose(g,distance=.7){
 const z=g.zombies[0];g.marv.root.position.set(0,0,0);g.marv.root.rotation.y=0;
 z.root.position.set(0,0,distance);z.root.rotation.y=Math.PI;
 g.marv.mixer.stopAllAction();g.marv.current='';g.play(g.marv,'kick',true,1.65);g.marv.mixer.update(.43);
 g.strikeType='kick';return z;
}
const steve=strikePose(g);g.play(steve,'block',true);steve.timer=.8;g.hit();assert.equal(steve.health,600);assert(g.marv.hitDone);
g.play(steve,'walk');steve.timer=0;g.marv.hitDone=false;g.hit();assert.equal(steve.health,538);
strikePose(g,2);g.hit();assert.equal(steve.health,538);
strikePose(g);steve.health=1;g.hit();assert.equal(g.kills,1);assert(steve.dead);assert.equal(steve.current,'death');
g.restart();assert.equal(g.health,100);assert.equal(g.zombies[0].health,600);assert(!g.zombies[0].dead);g.title();g.tickTitle(.1);assert.equal(g.zombies[0].current,'dance1');g.start();assert.equal(g.zombies[0].current,'walk');
// Pursuit closes in; repeated swings can defeat an idle player.
const chase=createGame();chase.start();for(let i=0;i<1200;i++)chase.tick(.05);assert.equal(chase.health,0);assert.equal(chase.marv.current,'death');
// Real animated bounds for both dancers at desktop and phone viewports.
const stage=createGame();stage.tickTitle(.01);
for(const [w,h] of [[390,844],[375,667],[320,568],[844,390],[1280,800]]){
 stage.mount={clientWidth:w,clientHeight:h};stage.resize();stage.camera.position.set(0,2.4,6+(w/h<.8?9.8:8.4));stage.camera.lookAt(0,1,6);stage.camera.updateMatrixWorld();
 for(const actor of [stage.marv,stage.zombies[0]])for(const name of stage.titleDances){
  actor.mixer.stopAllAction();actor.current='';stage.play(actor,name);const duration=actor.actions[name].getClip().duration;
  for(let frame=0;frame<12;frame++){actor.mixer.setTime(duration*frame/12);stage.scene.updateMatrixWorld(true);
   actor.root.traverse(o=>{if(!o.isSkinnedMesh)return;o.computeBoundingBox();const b=o.boundingBox;
    for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const q=new T.Vector3(x,y,z).applyMatrix4(o.matrixWorld).project(stage.camera);assert(q.x>-1&&q.x<1&&q.y>-1&&q.y<1,`Dancer bounds ${w}x${h} ${name}: ${q.toArray()}`);}
   });
  }
 }
}
console.log('PASS: all eight Steve clips; paired title dances and responsive animated bounds; blocking; damage; jump and range evasion; victory, defeat, replay, and pursuit.');

// A real finishing blow must leave Steve prone on the road, including after
// differently paced combat clips and mobile animation throttling.
for(const from of ['walk','run','block','attack'])for(const distant of [false,true]){
 const g=createGame();g.start();const a=g.zombies[0];
 g.play(a,from,true,from==='attack'?a.actions.attack.getClip().duration/1.65:1);
 a.mixer.update(.4);a.health=1;a.timer=0;
 strikePose(g,.6);for(let i=0;i<40&&!a.dead;i++){g.marv.mixer.update(.005);g.hit();}assert(a.dead,`Finisher contact after ${from}`);
 if(distant)g.marv.root.position.set(70,0,70);
 for(let i=0;i<90;i++)g.tick(.05);
 g.scene.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(a.root,true);
 assert(Math.abs(bounds.min.y-.05)<.002,`Steve must touch the road after ${from}: ${bounds.min.y}`);
 assert(bounds.max.y<.5,`Steve must lie prone after ${from}: ${bounds.max.y}`);
 assert.equal(a.actions.death.time,a.actions.death.getClip().duration);
 const original=templates[1].animations.find(c=>c.name==='death').tracks.find(t=>t.name==='spine.position');
 assert.deepEqual(a.actions.death.getClip().tracks.find(t=>t.name==='spine.position').values,original.values);
 g.title();g.tickTitle(.1);assert.equal(a.root.position.y,0);assert.equal(a.groundTarget,null);
 g.start();assert.equal(g.zombies[0].root.position.y,0);
}
console.log('PASS: Steve finishes the full fall, rests prone on the road, and resets cleanly for title/replay.');

// Check the authored swings against the opponent's animated body at every sample.
for(const who of ['marv','steve'])for(const kick of [false,true]){
 if(who==='steve'&&kick)continue;
 function swing(distance,{behind=false,elevation=0,wall=false}={}){
  const g=createGame();g.start();const a=who==='marv'?g.marv:g.zombies[0],b=who==='marv'?g.zombies[0]:g.marv;
  a.root.position.set(0,0,0);b.root.position.set(0,elevation,distance);a.root.rotation.y=behind?Math.PI:0;b.root.rotation.y=Math.PI;
  if(wall)g.colliders=[{x:0,z:distance/2,w:2,d:.05}];
  b.mixer.stopAllAction();b.current='';g.play(b,'walk');b.actions.walk.paused=true;b.mixer.update(0);
  a.mixer.stopAllAction();a.current='';const clip=who==='steve'?'attack':kick?'kick':'punch';g.play(a,clip,true,who==='steve'?a.actions.attack.getClip().duration/1.65:kick?1.65:2.9);
  let contacts=0;
  for(let t=0;t<1.3;t+=1/120){a.mixer.update(1/120);const active=who==='steve'?t>.28&&t<1.2:kick?t>.22&&t<.58:t>.08&&t<.62;if(active&&g.contact(a,b,kick))contacts++;}
  return contacts;
 }
 assert(swing(.7)>0,`${who} must connect at contact distance`);
 for(const gap of [1.5,2.1,2.5])assert.equal(swing(gap),0,`${who} must miss at ${gap}m`);
 assert.equal(swing(.7,{behind:true}),0);
 assert.equal(swing(.7,{elevation:2}),0);
 assert.equal(swing(.7,{wall:true}),0);
}
// Integrated player swings: one damage event per attack, and no damage across a gap.
for(const kind of ['punch','kick'])for(const dt of [1/120,1/30,.05]){
 for(const distance of [.7,2]){
  const g=createGame();g.start();const z=g.zombies[0];g.marv.root.position.set(0,0,0);z.root.position.set(0,0,distance);z.root.rotation.y=Math.PI;
  // Keep the target in place while running the real player animation/timing loop.
  z.current='attack';z.timer=10;z.hitDone=true;g.attack(kind);
  for(let t=0;t<.9;t+=dt)g.tick(dt);
  assert.equal(z.health,distance===2?600:600-(kind==='kick'?62:38),`${kind}, ${distance}m, dt ${dt}`);
 }
}
// Body collision still prevents walking through the opponent at close range.
const bodies=createGame();bodies.start();bodies.marv.root.position.set(0,0,0);bodies.zombies[0].root.position.set(0,0,1);
bodies.move(bodies.marv.root,new T.Vector3(0,0,3));assert(bodies.marv.root.position.z<=.400001);
console.log('PASS: animated limb contact, distant misses, facing, vertical separation, walls, single-hit swings at multiple frame rates, and solid bodies.');
// Steve's real wind-up can hurt at contact, but never at the former damage radius.
for(const distance of [.7,1.5,2.3])for(const dt of [1/120,1/30,.05]){
 const g=createGame();g.start();const z=g.zombies[0];g.marv.root.position.set(0,0,0);z.root.position.set(0,0,distance);z.root.rotation.y=Math.PI;
 g.play(z,'attack',true,z.actions.attack.getClip().duration/1.65);z.timer=1.65;z.hitDone=false;
 for(let t=0;t<1.3;t+=dt)g.tick(dt);
 assert.equal(g.health,distance===.7?78:100,`Steve contact at ${distance}m, dt ${dt}`);
}
console.log('PASS: actual Steve swings connect only at contact across multiple frame rates.');
