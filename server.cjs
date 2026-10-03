const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'dist');
const server=http.createServer((req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end('Invalid request');}
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}
    res.setHeader('Content-Type',target.endsWith('.mjs')?'text/javascript; charset=utf-8':target.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options','nosniff');res.end(data);});
});
server.on('error',err=>{console.error('Could not start Atlas: '+err.message);process.exitCode=1;});
server.listen(4173,'127.0.0.1',()=>console.log('Atlas is ready at http://127.0.0.1:4173 — keep this window open.'));
