// Classic Worker: dynamic ES module import leaves importScripts available to WASM.
let segmenterPromise;
function segmenter(){
 if(!segmenterPromise)segmenterPromise=(async()=>{
  const {FilesetResolver,ImageSegmenter}=await import('./vendor/mediapipe/vision_bundle.mjs');
  const files=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',self.location.href).href);
  return ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./assets/models/selfie_segmenter.tflite',self.location.href).href,delegate:'CPU'},runningMode:'IMAGE',outputConfidenceMasks:true,outputCategoryMask:false,canvas:new OffscreenCanvas(256,256)});
 })().catch(error=>{segmenterPromise=null;throw error;});
 return segmenterPromise;
}
let queue=Promise.resolve();
self.onmessage=({data:{id,bitmap}})=>{
 queue=queue.then(async()=>{
  try{
   const model=await segmenter();
   model.segment(bitmap,result=>{
    const masks=result.confidenceMasks;
    const person=masks[masks.length===1?0:1];
    const values=new Float32Array(person.getAsFloat32Array());
    self.postMessage({id,width:person.width,height:person.height,values},[values.buffer]);
   });
  }catch(error){self.postMessage({id,error:String(error.message||error)});}
  finally{bitmap.close();}
 });
};
