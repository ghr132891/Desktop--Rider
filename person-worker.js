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
// VIDEO mode of the same selfie model for live wallpapers (modules/live.js): frames with increasing timestamps,
// the tracker smooths masks between them.
let videoPromise;
function videoSegmenter(){
 if(!videoPromise)videoPromise=(async()=>{
  const {tasks,files}=await vision();
  return tasks.ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./assets/models/selfie_segmenter.tflite',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',outputConfidenceMasks:true,outputCategoryMask:false});
 })().catch(error=>{videoPromise=null;throw error;});
 return videoPromise;
}
// BlazeFace (short range) for the 萌版人物 rig (mascot-view.js): face box + 6 keypoints (eyes, nose, mouth, ears).
let facePromise;
function faceDetector(){
 if(!facePromise)facePromise=(async()=>{
  const {tasks,files}=await vision();
  return tasks.FaceDetector.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./assets/models/blaze_face_short_range.tflite',self.location.href).href,delegate:'CPU'},runningMode:'IMAGE',minDetectionConfidence:.4});
 })().catch(error=>{facePromise=null;throw error;});
 return facePromise;
}
function reply(id,mask){const values=new Float32Array(mask.getAsFloat32Array());self.postMessage({id,width:mask.width,height:mask.height,values},[values.buffer]);}
let queue=Promise.resolve(),lastStamp=0;
self.onmessage=({data:{id,bitmap,point,video,timestamp,face}})=>{
 queue=queue.then(async()=>{
  try{
   if(face){const model=await faceDetector(),w=bitmap.width,h=bitmap.height,result=model.detect(bitmap);self.postMessage({id,faces:(result.detections||[]).map(d=>({score:d.categories?.[0]?.score||0,box:{x:d.boundingBox.originX/w,y:d.boundingBox.originY/h,w:d.boundingBox.width/w,h:d.boundingBox.height/h},keypoints:(d.keypoints||[]).map(k=>({x:k.x,y:k.y}))}))});}
   else if(video){const model=await videoSegmenter();lastStamp=Math.max(lastStamp+1,Math.round(timestamp||0));model.segmentForVideo(bitmap,lastStamp,result=>{const masks=result.confidenceMasks;reply(id,masks[masks.length===1?0:1]);});}
   else if(point){const model=await interactive();model.segment(bitmap,{keypoint:point},result=>reply(id,result.confidenceMasks[0]));}
   else{const model=await segmenter();model.segment(bitmap,result=>{const masks=result.confidenceMasks;reply(id,masks[masks.length===1?0:1]);});}
  }catch(error){self.postMessage({id,error:String(error.message||error)});}
  finally{bitmap.close();}
 });
};
