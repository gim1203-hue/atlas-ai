import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {once} from 'node:events';
const {createServer} = createRequire(import.meta.url)('../server.cjs');
test('static server serves modules, rejects escapes and supports HEAD',async()=>{
  const server = createServer(); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const port = server.address().port; const base = 'http://127.0.0.1:'+port;
  try {
    for (const [path,type] of [['/','text/html'],['/app.mjs','text/javascript'],['/worker.mjs','text/javascript'],['/vendor/webllm.mjs','text/javascript'],['/style.css','text/css']]) {
      const result = await fetch(base+path); assert.equal(result.status,200,path); assert.ok(result.headers.get('content-type').startsWith(type)); assert.equal(result.headers.get('x-content-type-options'),'nosniff');
    }
    assert.equal((await fetch(base+'/missing')).status,404);
    assert.equal((await fetch(base+'/app.mjs',{method:'POST'})).status,405);
    const head = await fetch(base+'/app.mjs',{method:'HEAD'}); assert.equal(head.status,200); assert.equal(await head.text(),'');
    for (const path of ['/%2e%2e%5cREADME.md','/%2e%2e%2fREADME.md','/%00','/%ZZ']) {
      const status = await new Promise((resolve,reject)=>http.get({hostname:'127.0.0.1',port,path},response=>{response.resume(); resolve(response.statusCode);}).on('error',reject));
      assert.ok([400,403,404].includes(status),path+' returned '+status);
    }
  } finally {await new Promise(resolve=>server.close(resolve));}
});
