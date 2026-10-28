# 本地 MediaPipe 运行库

来源：Google MediaPipe `@mediapipe/tasks-vision`，固定版本 **0.10.21**。

下载地址：`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/`，包含 `vision_bundle.mjs` 与 SIMD / no-SIMD WASM 运行文件。使用项目本地静态文件，不在运行时访问 CDN。包信息见 package.json，许可证见 LICENSE。

模型源：
https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite

模型下载日期：2026-10-22。仓库内固定文件：`assets/models/selfie_segmenter.tflite`，运行时不追踪 latest。

SHA-256：

```
191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b  selfie_segmenter.tflite
40f4123dfcd75cfa58add046919cc6f52fde66f009ff582997c09ba54c6ba27c  vision_bundle.mjs
f00ec4731faa23b3e714d00e88d4d10e2df5c0a427d3a2b4ae6e3526fdd14ef7  vision_wasm_internal.wasm
3821ea9b1f7fb8c549ef2a064ef5c85750bf375c545a49fd6eea0df44a95f1f4  vision_wasm_nosimd_internal.wasm
```

官方模型说明：https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter#selfie_segmentation_model
