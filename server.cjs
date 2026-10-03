const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn} = require('node:child_process');
const types = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.wasm':'application/wasm', '.txt':'text/plain'};
function createServer({root = path.join(__dirname,'dist')} = {}) {
  root = path.resolve(root);
  return http.createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','no-cache');
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405,{'Allow':'GET, HEAD'}); return res.end('Method not allowed');}
    let pathname;
    try {pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch {res.writeHead(400); return res.end('Invalid request');}
    if (pathname.includes('\0')) {res.writeHead(400); return res.end('Invalid request');}
    const target = path.resolve(root,'.'+(pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root+path.sep)) {res.writeHead(403); return res.end('Forbidden');}
    try {
      const [realRoot,realTarget] = await Promise.all([fs.realpath(root),fs.realpath(target)]);
      if (!realTarget.startsWith(realRoot+path.sep)) {res.writeHead(403); return res.end('Forbidden');}
      const stat = await fs.stat(realTarget); if (!stat.isFile()) {res.writeHead(404); return res.end('Not found');}
      const type = types[path.extname(target).toLowerCase()] || 'application/octet-stream';
      res.setHeader('Content-Type',type+(type.startsWith('text/') || type === 'application/json' ? '; charset=utf-8' : ''));
      res.setHeader('Content-Length',stat.size);
      if (req.method === 'HEAD') {res.writeHead(200); return res.end();}
      const data = await fs.readFile(realTarget); res.writeHead(200); res.end(data);
    } catch (error) {res.writeHead(['ENOENT','ENOTDIR','EISDIR'].includes(error.code) ? 404 : 500); res.end('Could not read this file');}
  });
}
module.exports = {createServer};
if (require.main === module) {
  const server = createServer();
  const configured = process.env.PORT;
  let port = Number(configured || 4173); const firstPort = port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {console.error('PORT must be a number between 1 and 65535.'); process.exitCode = 1;}
  else {
    server.on('error',error => {
      if (error.code === 'EADDRINUSE' && !configured && port < firstPort+10) {port++; server.listen(port,'127.0.0.1');}
      else {console.error('Could not start Atlas: '+error.message); process.exitCode = 1;}
    });
    server.on('listening',() => {
      const url = 'http://127.0.0.1:'+port;
      console.log('Atlas is ready at '+url+' — keep this window open.');
      if (process.argv.includes('--open')) {
        const browser = spawn(process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open',[url],{windowsHide:true,stdio:'ignore'});
        browser.on('error',() => console.log('Open '+url+' in your browser.')); browser.unref();
      }
    });
    server.listen(port,'127.0.0.1');
  }
}
