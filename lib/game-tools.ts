import {flushSync} from 'react-dom';
import type {BremertonGame} from './game';
type Tool={name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>unknown};
type ToolContext={registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>};
export function registerGameTools(game:BremertonGame,setPlaying:(playing:boolean)=>void){
 const context=(document as Document & {modelContext?:ToolContext}).modelContext;
 if(!context?.registerTool)return ()=>{};
 const lifecycle=new AbortController();
 const read=()=>({screen:game.active?(game.paused?'paused':game.health<=0?'defeat':game.kills===1?'victory':'playing'):'title',health:game.health,stamina:Math.round(game.stamina),kills:game.kills,total:1,enemyHealth:game.zombies[0]?.health??600});
 const tools:Tool[]=[
  {name:'get_game_state',description:'Read the current Clash of the Titans game status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:read},
  {name:'control_game_screen',description:'Start a new game from the title, pause or resume gameplay, or return to the dancing title screen. Returning to the title ends the current run.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['start','pause','resume','title']}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){
   if(!input||typeof input!=='object'||Object.keys(input).length!==1||!('action' in input)||!['start','pause','resume','title'].includes(String(input.action)))throw new Error('Choose start, pause, resume, or title.');
   if(!game.loaded)throw new Error('The game is still loading.');
   const action=input.action;
   if(action==='start'&&game.active)throw new Error('A game is already in progress.');
   if((action==='pause'||action==='resume')&&(!game.active||game.health<=0||game.kills===1))throw new Error('There is no active game to pause or resume.');
   flushSync(()=>{if(action==='start'){game.start();setPlaying(true);}else if(action==='title'){game.title();setPlaying(false);}else if((action==='pause'&&!game.paused)||(action==='resume'&&game.paused))game.pause();});
   return read();
  }}
 ];
 for(const tool of tools)try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{/* Optional browser capability. */}
 return ()=>lifecycle.abort();
}
