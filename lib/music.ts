export type MusicStatus='loading'|'playing'|'blocked'|'muted'|'error';

/** One looping track shared by the title screen and gameplay. */
export class Soundtrack {
 private audio:HTMLAudioElement;
 private muted=false;
 private disposed=false;
 private revision=0;
 constructor(source:string,private status:(status:MusicStatus)=>void){
  this.audio=new Audio(source);
  this.audio.loop=true;
  this.audio.preload='auto';
  this.audio.volume=.45;
  this.audio.addEventListener('error',this.failed);
  document.addEventListener('pointerup',this.gesture);
  document.addEventListener('keydown',this.gesture);
  document.addEventListener('visibilitychange',this.visibility);
  void this.play();
 }
 private failed=()=>{if(!this.disposed&&!this.muted)this.status('error');};
 private gesture=(event:Event)=>{
  if(event.target instanceof Element&&event.target.closest('[data-sound-toggle]'))return;
  if(this.audio.paused&&!this.muted)void this.play();
 };
 private visibility=()=>{
  if(document.hidden){this.revision++;this.audio.pause();}
  else if(!this.muted)void this.play();
 };
 async play(){
  if(this.disposed||this.muted||document.hidden)return;
  const revision=++this.revision;
  try{
   await this.audio.play();
   if(!this.disposed&&revision===this.revision)this.status('playing');
  }catch(error){
   if(this.disposed||revision!==this.revision)return;
   this.status(error instanceof Error&&error.name==='NotAllowedError'?'blocked':'error');
  }
 }
 setMuted(muted:boolean){
  if(this.disposed)return;
  this.muted=muted;this.revision++;
  if(muted){this.audio.pause();this.status('muted');}
  else void this.play();
 }
 dispose(){
  this.disposed=true;this.revision++;this.audio.pause();
  this.audio.removeEventListener('error',this.failed);
  document.removeEventListener('pointerup',this.gesture);
  document.removeEventListener('keydown',this.gesture);
  document.removeEventListener('visibilitychange',this.visibility);
  this.audio.removeAttribute('src');this.audio.load();
 }
}
