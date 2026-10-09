// Analyze amplitude on the audio thread; never forward or replay the input waveform.
class MicrophoneLevelProcessor extends AudioWorkletProcessor{
 constructor(){super();this.count=0;this.sum=0;this.squares=0;}
 process(inputs,outputs){
  for(const channel of outputs[0]||[])channel.fill(0);
  for(const value of inputs[0]?.[0]||[]){this.count++;this.sum+=value;this.squares+=value*value;}
  if(this.count>=sampleRate*.032){
   const mean=this.sum/this.count,raw=Math.sqrt(Math.max(0,this.squares/this.count-mean*mean));
   this.port.postMessage({raw});this.count=0;this.sum=0;this.squares=0;
  }
  return true;
 }
}
registerProcessor('lesson-microphone-level',MicrophoneLevelProcessor);
