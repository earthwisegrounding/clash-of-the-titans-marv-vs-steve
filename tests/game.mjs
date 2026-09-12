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
const steve=g.zombies[0];g.marv.root.position.set(0,0,0);g.marv.root.rotation.y=0;steve.root.position.set(0,0,1.5);
g.play(steve,'block',true);steve.timer=.8;g.strikeType='kick';g.hit();assert.equal(steve.health,600);
g.play(steve,'attack',true);steve.timer=.5;g.hit();assert.equal(steve.health,538);
steve.root.position.set(0,0,1.5);steve.root.rotation.y=Math.PI;steve.hitDone=false;g.tick(.05);assert.equal(g.health,78);
g.invulnerable=0;g.elevation=1;g.marv.root.position.y=1;steve.hitDone=false;g.tick(.05);assert.equal(g.health,78);
g.elevation=0;g.marv.root.position.y=0;g.invulnerable=0;steve.root.position.set(0,0,4);steve.hitDone=false;g.tick(.05);assert.equal(g.health,78);
steve.root.position.set(0,0,1.5);steve.health=1;g.strikeType='punch';g.hit();assert.equal(g.kills,1);assert(steve.dead);assert.equal(steve.current,'death');
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
 a.root.position.copy(g.marv.root.position).add(new T.Vector3(0,0,1.5));
 g.marv.root.rotation.y=0;g.strikeType='kick';g.hit();assert(a.dead);
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
