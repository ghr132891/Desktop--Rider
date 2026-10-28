// Classic Worker: dynamic ES module import leaves importScripts available to WASM.
let visionPromise,segmenterPromise,interactivePromise;
function vision(){
 if(!visionPromise)visionPromise=(async()=>{
  const tasks=await import('./vendor/mediapipe/vision_bundle.mjs');
  const files=await tasks.FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',self.location.href).href);
  return {tasks,files};
 })().catch(error=>{visionPromise=null;throw error;});
 return visionPromise;
}
function segmenter(){
 if(!segmenterPromise)segmenterPromise=(async()=>{
  const {tasks,files}=await vision();
  return tasks.ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./assets/models/selfie_segmenter.tflite',self.location.href).href,delegate:'CPU'},runningMode:'IMAGE',outputConfidenceMasks:true,outputCategoryMask:false});
 })().catch(error=>{segmenterPromise=null;throw error;});
 return segmenterPromise;
}
// MagicTouch: generic "the object under this point" model. Works on illustrations
// and line art where the selfie model only sees photographed people.
function interactive(){
 if(!interactivePromise)interactivePromise=(async()=>{
  const {tasks,files}=await vision();
  return tasks.InteractiveSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./assets/models/magic_touch.tflite',self.location.href).href,delegate:'CPU'},outputConfidenceMasks:true,outputCategoryMask:false});
 })().catch(error=>{interactivePromise=null;throw error;});
 return interactivePromise;
}
function reply(id,mask){const values=new Float32Array(mask.getAsFloat32Array());self.postMessage({id,width:mask.width,height:mask.height,values},[values.buffer]);}
let queue=Promise.resolve();
self.onmessage=({data:{id,bitmap,point}})=>{
 queue=queue.then(async()=>{
  try{
   if(point){const model=await interactive();model.segment(bitmap,{keypoint:point},result=>reply(id,result.confidenceMasks[0]));}
   else{const model=await segmenter();model.segment(bitmap,result=>{const masks=result.confidenceMasks;reply(id,masks[masks.length===1?0:1]);});}
  }catch(error){self.postMessage({id,error:String(error.message||error)});}
  finally{bitmap.close();}
 });
};
