import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {initFileWorkspace} from '../dist/files.mjs';
import {unzipSync,strFromU8} from '../dist/vendor/zip.mjs';

test('files and nested folders import, search, open, edit and export correctly',async()=>{
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/'}); globalThis.document=dom.window.document; globalThis.window=dom.window;
  const $=id=>document.getElementById(id); let context=[]; let saved=[];
  const workspace=initFileWorkspace({notice(){},onAttach:files=>{context=files;},storage:{load:async()=>({files:[],selected:null}),save:async files=>{saved=files;},remove:async()=>{}}});
  const make=(path,text)=>{const file=new File([text],path.split('/').at(-1)); Object.defineProperty(file,'webkitRelativePath',{value:path}); return file;};
  const search=value=>{$('file-search').value=value; $('file-search').dispatchEvent(new dom.window.Event('input'));};
  const savedCreate=URL.createObjectURL; const savedRevoke=URL.revokeObjectURL; let exported;
  URL.createObjectURL=blob=>{exported=blob; return 'blob:test';}; URL.revokeObjectURL=()=>{};
  dom.window.HTMLAnchorElement.prototype.click=()=>{};
  try {
    await workspace.ready;
    const target={files:[make('Site/src/App.jsx','export default 1;'),make('Site/src/styles/main.css','body {}'),make('Site/README.md','Read me'),make('Site/node_modules/skip.js','skip'),make('Site/icon.png','binary')],value:'folder'};
    await $('open-folder').onchange({target});
    assert.equal(target.value,''); assert.equal(document.querySelectorAll('.project-row').length,3);
    assert.match($('project-status').textContent,/Skipped 1/); assert.equal($('project-workspace').open,true);
    search('STYLES'); assert.equal(document.querySelectorAll('.project-row').length,1);
    assert.match($('project-list').textContent,/Site\/src\/styles/);
    document.querySelector('.project-row button').click(); assert.equal($('editing-file').textContent,'Site/src/styles/main.css'); assert.equal($('file-editor').value,'body {}');
    $('file-editor').value='body { color: red; }'; $('file-editor').dispatchEvent(new dom.window.Event('input'));
    search('src app'); assert.equal(document.querySelectorAll('.project-row').length,1);
    search('unknown-folder'); assert.equal(document.querySelectorAll('.project-row').length,0); assert.match($('project-list').textContent,/No matching/); assert.equal($('file-editor').value,'body { color: red; }');
    $('clear-file-search').click(); assert.equal(document.querySelectorAll('.project-row').length,3);
    document.querySelector('[aria-label="Open folder Site/src/styles"]').click(); assert.equal(document.querySelectorAll('.project-row').length,1);
    await $('open-files').onchange({target:{files:[make('Site/src/styles/main.css','overwrite'),new File(['plain'],'notes.txt')],value:'files'}});
    assert.equal(document.querySelectorAll('.project-row').length,4); assert.equal(context.find(file=>file.name==='Site/src/styles/main.css').text,'body { color: red; }');
    search('notes'); document.querySelector('.project-row button').click(); assert.equal($('file-editor').value,'plain');
    $('download-file').click(); assert.equal(await exported.text(),'plain');
    await $('download-project').onclick();
    const archive=unzipSync(new Uint8Array(await exported.arrayBuffer()));
    assert.equal(strFromU8(archive['Site/src/styles/main.css']),'body { color: red; }'); assert.equal(strFromU8(archive['notes.txt']),'plain');
    await workspace.flush(); assert.equal(saved.find(file=>file.name==='Site/src/styles/main.css').text,'body { color: red; }');
  } finally {await workspace.flush(); URL.createObjectURL=savedCreate; URL.revokeObjectURL=savedRevoke; dom.window.close();}
});

test('message window is above composer and generated files can target projects and disk',async()=>{
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/'}); globalThis.document=dom.window.document; globalThis.window=dom.window;
  const $=id=>document.getElementById(id); let feedback=''; let snapshot;
  const workspace=initFileWorkspace({notice:text=>{feedback=text;},onAttach(){},storage:{
    load:async()=>({files:[],selected:null}),save:async(files)=>{snapshot=files;},remove:async()=>{},
  }});
  try {
    await workspace.ready;
    assert.equal($('messages').closest('.message-window').nextElementSibling,$('chat-form'));
    workspace.writeCode('alpha/main.py','print("alpha")');
    $('project-target').value='all'; workspace.writeCode('beta/main.py','print("beta")');
    $('project-target').value='root:alpha'; workspace.writeCode('src/new.py','print("new")');
    assert.equal($('editing-file').textContent,'alpha/src/new.py');
    assert.equal($('file-editor').value,'print("new")');
    $('project-target').value='root:beta'; workspace.writeCode('src/new.py','print("beta new")');
    assert.equal($('editing-file').textContent,'beta/src/new.py');
    dom.window.confirm=()=>false; workspace.writeCode('src/new.py','overwrite');
    assert.equal($('file-editor').value,'print("beta new")');
    dom.window.confirm=()=>true; workspace.writeCode('src/new.py','updated'); $('undo-edit').click();
    assert.equal($('file-editor').value,'print("beta new")');
    workspace.writeCode('../escape.py','bad'); assert.match(feedback,/relative filename/);
    let diskText; let closed=false;
    dom.window.showSaveFilePicker=async options=>{
      assert.equal(options.suggestedName,'new.py');
      return {createWritable:async()=>({write:async text=>{diskText=text;},close:async()=>{closed=true;}})};
    };
    await $('save-disk').onclick(); assert.equal(diskText,'print("beta new")'); assert.equal(closed,true);
    dom.window.showSaveFilePicker=async()=>{throw Object.assign(Error('Cancelled'),{name:'AbortError'});};
    await $('save-disk').onclick(); assert.equal($('file-editor').value,'print("beta new")');
    await workspace.flush(); assert.equal(snapshot.find(file=>file.name==='beta/src/new.py').text,'print("beta new")');
  } finally {await workspace.flush(); dom.window.close();}
});

test('send loads AI once, streams code, handles failure and permits retry',async()=>{
  const html = await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const dom = new JSDOM(html,{url:'http://localhost/'});
  globalThis.document = dom.window.document; globalThis.window = dom.window; globalThis.localStorage = dom.window.localStorage;
  Object.defineProperty(dom.window,'isSecureContext',{value:true});
  const savedNavigator = globalThis.navigator; const savedWorker = globalThis.Worker;
  Object.defineProperty(globalThis,'navigator',{value:{gpu:{requestAdapter:async()=>({})}},configurable:true});
  const workers=[];
  globalThis.Worker = class extends EventTarget {constructor(){super(); workers.push(this);} terminate() {this.terminated=true;}};
  let loads = 0; let fail = false; let hang = false;
  localStorage.setItem('atlas-workspace-v1',JSON.stringify({version:1,notes:[],active:'saved',chats:[{id:'saved',title:'Saved',messages:[],draft:'Restored draft'}]}));
  globalThis.__atlasTestWebllm = {CreateWebWorkerMLCEngine:async()=>{
    loads++;
    return {chat:{completions:{create:async function*() {
      if (hang) await new Promise(()=>{});
      if (fail) throw Error('Simulated GPU failure');
      yield {choices:[{delta:{content:'```html\n<h1>Hello</h1>\n```'},finish_reason:'stop'}]};
    }}}};
  }};
  try {
    // Substitute only the hardware boundary; execute the real app and workspace modules.
    let source = await readFile(new URL('../dist/app.mjs',import.meta.url),'utf8');
    source = source.replace("await import('./vendor/webllm.mjs')",'globalThis.__atlasTestWebllm');
    source = source.replace(/(['"])\.\/([^'"]+)\1/g,(_,quote,path)=>quote+new URL('../dist/'+path,import.meta.url).href+quote);
    await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    const $ = id=>document.getElementById(id);
    assert.equal($('question').value,'Restored draft');
    $('question').value='Draft before switching'; $('question').dispatchEvent(new dom.window.Event('input'));
    $('new-chat').click(); document.querySelectorAll('.conversation')[1].click();
    assert.equal($('question').value,'Draft before switching');
    assert.equal(JSON.parse(localStorage.getItem('atlas-workspace-v1')).chats.find(chat=>chat.id==='saved').draft,'Draft before switching');
    const send = async question=>{
      $('question').value=question; $('question').dispatchEvent(new dom.window.Event('input'));
      await $('chat-form').onsubmit({preventDefault(){}});
    };
    await send('Show an HTML heading');
    assert.equal(loads,1); assert.equal($('question').value,''); assert.equal($('send').disabled,true);
    assert.equal(document.querySelector('#messages code').textContent,'<h1>Hello</h1>');
    assert.equal(document.querySelector('.chat-pane-title').hidden,true);
    assert.equal($('stop').hidden,true); assert.equal($('new-chat').disabled,false);
    fail=true; await send('Try again');
    assert.match($('messages').textContent,/Simulated GPU failure/); assert.equal($('new-chat').disabled,false);
    fail=false; await send('Retry now'); assert.equal(loads,1);
    assert.equal(document.querySelectorAll('#messages .message').length,6);
    workers.at(-1).dispatchEvent(new Event('error'));
    assert.equal(workers.at(-1).terminated,true); assert.match($('status').textContent,/stopped unexpectedly/);
    await send('Restart after crash'); assert.equal(loads,2);
    hang=true; const stuck=send('A request that hangs');
    await new Promise(resolve=>setTimeout(resolve,0)); assert.equal($('stop').hidden,false);
    $('stop').click(); await stuck; hang=false;
    assert.equal($('stop').hidden,true); assert.equal($('new-chat').disabled,false);
    assert.match($('messages').textContent,/Generation stopped/);
    await send('Retry after stopping'); assert.equal(loads,3);
    $('library-only').checked=true; await send('zzzzunmatched');
    assert.match($('messages').textContent,/could not find relevant passages/); assert.equal($('send').disabled,true);
    $('unload').click(); $('question').value='Keep my draft'; $('question').dispatchEvent(new dom.window.Event('input'));
    globalThis.__atlasTestWebllm.CreateWebWorkerMLCEngine=()=>new Promise(()=>{});
    const pending=$('chat-form').onsubmit({preventDefault(){}});
    for (let i=0;i<10 && $('progress').hidden;i++) await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal($('question').disabled,true); assert.equal($('new-chat').disabled,true);
    $('cancel-load').click(); await pending;
    assert.equal($('question').value,'Keep my draft'); assert.equal($('question').disabled,false);
    assert.equal($('send').disabled,false); assert.match($('chat-status').textContent,/cancelled/);
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(JSON.parse(localStorage.getItem('atlas-workspace-v1')).chats.find(chat=>chat.id==='saved').draft,'Keep my draft');
  } finally {
    Object.defineProperty(globalThis,'navigator',{value:savedNavigator,configurable:true});
    globalThis.Worker=savedWorker; delete globalThis.__atlasTestWebllm; dom.window.close();
  }
});

test('file editor creates, edits, applies and undoes AI suggestions safely',async()=>{
  const html = await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const dom = new JSDOM(html,{url:'http://localhost/'}); globalThis.document = dom.window.document; globalThis.window = dom.window;
  let context = []; let feedback = '';
  const workspace = initFileWorkspace({notice:message=>{feedback=message;},onAttach:files=>{context=files;}});
  await workspace.ready;
  const $ = id=>document.getElementById(id);
  $('new-filename').value = 'index.html'; $('create-file').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  assert.equal($('editing-file').textContent,'index.html'); assert.equal($('file-editor').disabled,false);
  $('file-editor').value = '<h1>Original</h1>'; $('file-editor').dispatchEvent(new dom.window.Event('input'));
  assert.equal(context[0].text,'<h1>Original</h1>');
  workspace.applyCode('<script>alert(1)</script>','html');
  assert.equal($('file-editor').value,'<script>alert(1)</script>'); assert.equal(document.querySelector('#project-workspace script'),null);
  $('undo-edit').click(); assert.equal($('file-editor').value,'<h1>Original</h1>');
  $('new-filename').value = '../invalid'; $('create-file').dispatchEvent(new dom.window.Event('submit',{cancelable:true})); assert.equal(context.length,1);
  for (let i=0;i<5;i++) {$('new-filename').value = 'file'+i+'.js'; $('create-file').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));}
  assert.equal(context.length,5); const checkboxes = [...document.querySelectorAll('#project-list input')];
  checkboxes[5].checked = true; checkboxes[5].dispatchEvent(new dom.window.Event('change')); assert.equal(checkboxes[5].checked,false); assert.match(feedback,/five files/);
  dom.window.confirm = ()=>true;
  $('delete-file').click(); assert.equal(document.querySelectorAll('.project-row').length,5);
  $('restore-project').click(); assert.equal(document.querySelectorAll('.project-row').length,6);
  $('delete-project').click(); assert.equal(document.querySelectorAll('.project-row').length,0);
  $('restore-project').click(); assert.equal(document.querySelectorAll('.project-row').length,6);
  await workspace.flush();
  dom.window.close();
});

test('app library, storage, validation, conversations and unavailable GPU work',async()=>{
  const html = await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const dom = new JSDOM(html,{url:'http://localhost/'});
  globalThis.document = dom.window.document; globalThis.window = dom.window; globalThis.localStorage = dom.window.localStorage;
  Object.defineProperty(dom.window,'isSecureContext',{value:true});
  const savedNavigator = globalThis.navigator; Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
  try {
    await import('../dist/app.mjs?ui-test'); const $ = id=>document.getElementById(id);
    assert.equal($('count').textContent,'4'); assert.equal($('send').disabled,true);
    $('maximize-workspace').click(); assert.equal(document.body.classList.contains('workspace-expanded'),true); assert.equal($('maximize-workspace').getAttribute('aria-pressed'),'true');
    $('maximize-workspace').click(); assert.equal(document.body.classList.contains('workspace-expanded'),false);
    const folderFile=new File(['folder contents'],'readme.md'); Object.defineProperty(folderFile,'webkitRelativePath',{value:'Attached/readme.md'});
    await $('attach-folder').onchange({target:{files:[folderFile],value:'folder'}});
    assert.match($('project-list').textContent,/Attached\/readme.md/); assert.equal($('attach-folder').disabled,false);
    document.querySelector('[data-view="library"]').click(); assert.equal($('library-view').hidden,false);
    $('note-title').value='Test reference'; $('note-text').value='Test contents'; $('note-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
    assert.equal($('count').textContent,'5'); assert.match($('save-status').textContent,/Saved/);
    assert.equal(JSON.parse(localStorage.getItem('atlas-workspace-v1')).notes.at(-1).title,'Test reference');
    $('note-title').value=' '; $('note-text').value=' '; $('note-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true})); assert.equal($('count').textContent,'5'); assert.match($('library-status').textContent,/title and text/);
    $('new-chat').click(); assert.equal(document.querySelectorAll('.conversation').length,2); assert.equal($('chat-view').hidden,false);
    $('load').click(); await new Promise(resolve=>setTimeout(resolve,10)); assert.match($('status').textContent,/WebGPU is unavailable/); assert.equal($('load').disabled,false);
    $('question').value='Hello'; $('question').dispatchEvent(new dom.window.Event('input'));
    assert.equal($('send').disabled,false); assert.equal($('send').textContent,'Start AI & send');
    $('chat-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true})); await new Promise(resolve=>setTimeout(resolve,10));
    assert.match($('chat-status').textContent,/WebGPU is unavailable/); assert.equal($('question').value,'Hello');
    assert.equal($('send').disabled,false); assert.equal(document.querySelectorAll('#messages .message').length,0);
    $('question').value='  '; $('question').dispatchEvent(new dom.window.Event('input')); assert.equal($('send').disabled,true);
    document.querySelector('[data-question]').click(); assert.equal($('send').disabled,false);
    $('new-chat').click(); assert.equal($('send').disabled,true);
    dom.window.confirm = ()=>true; $('delete-chat').click(); assert.equal(document.querySelectorAll('.conversation').length,2);
  } finally {
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    await new Promise(resolve=>setTimeout(resolve,0));
    Object.defineProperty(globalThis,'navigator',{value:savedNavigator,configurable:true}); dom.window.close();
  }
});
