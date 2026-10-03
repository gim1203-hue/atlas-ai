import {build} from 'esbuild';
import {mkdir, copyFile} from 'node:fs/promises';
await mkdir('dist/vendor',{recursive:true});
await build({entryPoints:['node_modules/@mlc-ai/web-llm/lib/index.js'],bundle:true,format:'esm',platform:'browser',outfile:'dist/vendor/webllm.mjs',minify:true,legalComments:'eof'});
await build({entryPoints:['node_modules/fflate/esm/browser.js'],bundle:true,format:'esm',platform:'browser',outfile:'dist/vendor/zip.mjs',minify:true,legalComments:'eof'});
await copyFile('node_modules/fflate/LICENSE','dist/vendor/fflate-LICENSE.txt');
console.log('Built local AI and ZIP modules.');
