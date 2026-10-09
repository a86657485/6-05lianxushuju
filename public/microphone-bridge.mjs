import {uniqueId} from './sync.mjs?v=1';

/** A LAN dashboard receives relative levels from a teacher-only localhost window. */
export class TeacherMicrophoneBridge{
 constructor({microphoneUrl,hostWindow=window,onSample=()=>{},onStatus=()=>{}}){
  Object.assign(this,{microphoneUrl,hostWindow,onSample,onStatus});this.origin=new URL(microphoneUrl).origin;
  this.onMessage=event=>{
   const data=event.data;
   if(event.origin!==this.origin||event.source!==this.popup||!data||data.channel!==this.channel)return;
   if(data.type==='teacher-microphone-ready'){this.ready=true;this.command('start');}
   if(data.type==='teacher-microphone-sample'&&Number.isFinite(data.level)&&data.level>=0&&data.level<=1)this.onSample({level:data.level,source:'microphone'});
   if(data.type==='teacher-microphone-status'&&['calibrating','listening','stopped','error'].includes(data.state)&&typeof data.message==='string')this.onStatus({state:data.state,message:data.message});
  };
  hostWindow.addEventListener('message',this.onMessage);
 }
 start(){
  if(this.popup&&!this.popup.closed){this.popup.focus();if(this.ready)this.command('start');return;}
  this.channel=uniqueId();this.ready=false;
  const url=new URL(this.microphoneUrl);url.searchParams.set('parentOrigin',this.hostWindow.location.origin);url.searchParams.set('channel',this.channel);
  this.popup=this.hostWindow.open(url.href,'lesson5-teacher-microphone-'+this.channel,'popup,width=560,height=660');
  if(!this.popup){this.onStatus({state:'error',message:'麦克风窗口被拦截。请允许此页面弹窗，然后再次点击开启。'});return;}
  this.onStatus({state:'calibrating',message:'本机麦克风窗口已打开。请在新窗口允许使用麦克风，授权后会同步到当前页面。'});
  this.hostWindow.clearInterval(this.monitor);
  this.monitor=this.hostWindow.setInterval(()=>{if(this.popup?.closed)this.stop();},500);
 }
 command(action){if(this.ready&&!this.popup?.closed)this.popup.postMessage({type:'teacher-microphone-command',channel:this.channel,action},this.origin);}
 calibrate(){this.command('calibrate');}
 stop(){
  this.command('stop');if(this.popup&&!this.popup.closed)this.popup.close();this.popup=null;this.ready=false;
  this.hostWindow.clearInterval(this.monitor);this.monitor=null;
  this.onSample({level:0,source:'microphone'});this.onStatus({state:'stopped',message:'麦克风已关闭，声音采集已停止。'});
 }
 destroy(){this.stop();this.hostWindow.removeEventListener('message',this.onMessage);}
}
