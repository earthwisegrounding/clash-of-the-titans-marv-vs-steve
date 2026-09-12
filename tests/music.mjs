import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
await fs.mkdir('.test-work',{recursive:true});
await fs.writeFile('.test-work/music.mjs',ts.transpileModule(await fs.readFile('lib/music.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {Soundtrack}=await import('../.test-work/music.mjs');
globalThis.document=Object.assign(new EventTarget(),{hidden:false});
globalThis.Element=class extends EventTarget{closest(){return null;}};
let current,allow=false,deferred;
globalThis.Audio=class extends EventTarget{
 paused=true;calls=0;currentTime=42;src;loop=false;volume=1;preload='';
 constructor(src){super();this.src=src;current=this;}
 play(){this.calls++;if(deferred)return deferred;if(!allow)return Promise.reject(new DOMException('Tap required','NotAllowedError'));this.paused=false;return Promise.resolve();}
 pause(){this.paused=true;}
 removeAttribute(){this.src='';}
 load(){}
};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const states=[];const track=new Soundtrack('music/test.mp3',s=>states.push(s));
await flush();assert.equal(states.at(-1),'blocked');assert.equal(current.loop,true);assert.equal(current.volume,.45);
allow=true;document.dispatchEvent(new Event('pointerup'));await flush();assert.equal(states.at(-1),'playing');assert.equal(current.paused,false);
const calls=current.calls;document.dispatchEvent(new Event('pointerup'));await flush();assert.equal(current.calls,calls,'No duplicate playback during gameplay gestures');
track.setMuted(true);assert.equal(current.paused,true);document.dispatchEvent(new Event('keydown'));await flush();assert.equal(current.calls,calls,'Gestures must not undo mute');
track.setMuted(false);await flush();assert.equal(states.at(-1),'playing');assert.equal(current.currentTime,42,'Unmute resumes the same track');
document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert(current.paused);
document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(current.paused,false);
track.setMuted(true);document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await flush();assert(current.paused,'Hidden tab round-trip preserves mute');
let resolve;deferred=new Promise(r=>resolve=r);track.setMuted(false);track.setMuted(true);resolve();await flush();assert.equal(states.at(-1),'muted','Late play result cannot overwrite mute');
const before=current.calls;track.dispose();document.dispatchEvent(new Event('pointerup'));await flush();assert.equal(current.calls,before);assert.equal(current.src,'');
console.log('PASS: title autoplay fallback, gesture start, looping, mute, tab visibility, late-promise handling, and cleanup.');
