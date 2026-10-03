import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {initFileWorkspace} from '../dist/files.mjs';

test('file editor creates, edits, applies and undoes AI suggestions safely',async()=>{
  const html = await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const dom = new JSDOM(html,{url:'http://localhost/'}); globalThis.document = dom.window.document; globalThis.window = dom.window;
  let context = []; let feedback = '';
  const workspace = initFileWorkspace({notice:message=>{feedback=message;},onAttach:files=>{context=files;}});
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
    document.querySelector('[data-view="library"]').click(); assert.equal($('library-view').hidden,false);
    $('note-title').value='Test reference'; $('note-text').value='Test contents'; $('note-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
    assert.equal($('count').textContent,'5'); assert.match($('save-status').textContent,/Saved/);
    assert.equal(JSON.parse(localStorage.getItem('atlas-workspace-v1')).notes.at(-1).title,'Test reference');
    $('note-title').value=' '; $('note-text').value=' '; $('note-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true})); assert.equal($('count').textContent,'5'); assert.match($('library-status').textContent,/title and text/);
    $('new-chat').click(); assert.equal(document.querySelectorAll('.conversation').length,2); assert.equal($('chat-view').hidden,false);
    $('load').click(); await new Promise(resolve=>setTimeout(resolve,10)); assert.match($('status').textContent,/WebGPU is unavailable/); assert.equal($('load').disabled,false);
    $('question').value='Hello'; $('chat-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true})); await new Promise(resolve=>setTimeout(resolve,10)); assert.match($('chat-status').textContent,/Start the free AI/);
    dom.window.confirm = ()=>true; $('delete-chat').click(); assert.equal(document.querySelectorAll('.conversation').length,1);
  } finally {Object.defineProperty(globalThis,'navigator',{value:savedNavigator,configurable:true}); dom.window.close();}
});
