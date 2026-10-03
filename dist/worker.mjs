import {WebWorkerMLCEngineHandler} from './vendor/webllm.mjs';
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = event => handler.onmessage(event);
