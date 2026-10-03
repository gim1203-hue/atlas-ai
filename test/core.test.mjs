import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNotes,retrieve} from '../dist/knowledge.mjs';
import {newWorkspace,restoreWorkspace,buildRequest,splitCode,bytePrefix} from '../dist/workspace.mjs';
import {safePath,readTextFile} from '../dist/files.mjs';
import {zipSync,unzipSync,strToU8,strFromU8} from '../dist/vendor/zip.mjs';

test('library rejects malformed references and unsafe source schemes',()=>{
  for (const value of [null,{},[{title:' ',text:'text'}],[{title:'title',text:'text',url:'javascript:alert(1)'}],[{title:'title',text:'text',url:0}]]) assert.throws(()=>validateNotes(value));
  const notes = validateNotes([{title:'  Title  ',text:'  Text  ',url:'https://example.com'}]);
  assert.equal(notes[0].title,'Title'); assert.equal(notes[0].text,'Text');
});
test('retrieval matches whole words and returns only relevant passages',()=>{
  const notes = validateNotes([{title:'Summary',text:'Return a value. Firebase has a database.'},{title:'JavaScript',text:'Arrays support sorting.'}]);
  assert.equal(retrieve('sum',notes).length,0);
  assert.equal(retrieve('Firebase database',notes)[0].title,'Summary');
  assert.equal(retrieve('JavaScript arrays',notes)[0].title,'JavaScript');
  assert.deepEqual(retrieve('the and it',notes),[]);
});
test('workspace restores conversations and rejects damaged metadata',()=>{
  const state = newWorkspace([]); state.chats[0].messages.push({role:'user',content:'hello',files:12},{role:'assistant',content:'Hi'});
  const restored = restoreWorkspace(JSON.stringify(state),validateNotes,[]);
  assert.equal(restored.chats[0].messages[1].content,'Hi'); assert.equal(restored.chats[0].messages[0].files,undefined);
  const invalid = structuredClone(state); invalid.chats.push(invalid.chats[0]); assert.throws(()=>restoreWorkspace(JSON.stringify(invalid),validateNotes,[]));
  assert.throws(()=>restoreWorkspace('{broken',validateNotes,[]));
});
test('prompt budgets preserve complete turns and report omitted file content',()=>{
  const request = buildRequest({question:'Fix the attached JavaScript.',files:[{name:'app.js',text:'a'.repeat(20000)}],history:[{role:'user',content:'old'},{role:'assistant',content:'old response'}]});
  assert.ok(request.warnings.some(warning=>warning.includes('app.js')));
  assert.ok(new TextEncoder().encode(request.messages.map(m=>m.content).join('')).length <= 2820);
  assert.deepEqual(request.includedFiles,['app.js']);
  assert.throws(()=>buildRequest({question:' '}));
  assert.throws(()=>buildRequest({question:'界'.repeat(1000)}));
  const followup = buildRequest({question:'Next?',history:[{role:'user',content:'first'},{role:'assistant',content:'answer'},{role:'user',content:'failed'},{role:'assistant',content:'error',failed:true}]});
  assert.deepEqual(followup.messages.map(m=>m.content).slice(1),['first','answer','Next?']);
  assert.ok(buildRequest({question:'Create this file',files:[{name:'index.html',text:''}]}).messages[0].content.includes('index.html'));
  assert.equal(bytePrefix('a😀b',5),'a😀');
});
test('fenced code keeps markup as text and handles interrupted blocks',()=>{
  const parts = splitCode('Here:\n```html\n<script>alert(1)</script>\n```\nDone.');
  assert.equal(parts[1].type,'code'); assert.equal(parts[1].text,'<script>alert(1)</script>');
  assert.equal(splitCode('```js\nconst x = 1;')[0].text,'const x = 1;');
});
test('text file imports accept varied extensions and UTF-16, reject binaries',async()=>{
  for (const name of ['index.html','style.css','app.js','main.py','Dockerfile','.gitignore','config.toml']) {
    assert.equal((await readTextFile(new File(['hello'],name))).text,'hello');
  }
  assert.equal((await readTextFile(new File([new Uint8Array([255,254,65,0])],'utf16.txt'))).text,'A');
  await assert.rejects(readTextFile(new File([new Uint8Array([0,1,2])],'unknown.bin')));
  await assert.rejects(readTextFile(new File(['not really PDF'],'test.pdf')));
  await assert.rejects(readTextFile(new File([new Uint8Array([255,255])],'invalid.txt')));
  await assert.rejects(readTextFile(new File(['x'.repeat(30001)],'large.js')));
});
test('relative project paths reject traversal and ZIP exports preserve contents',()=>{
  for (const name of ['../secret','/absolute','a/../b','C:\\file.js','a//b','con.txt']) assert.throws(()=>safePath(name));
  assert.equal(safePath('src\\app.js'),'src/app.js');
  assert.equal(safePath('.gitignore'),'.gitignore');
  assert.equal(safePath('.github/workflows/check.yml'),'.github/workflows/check.yml');
  const archive = unzipSync(zipSync({'src/app.js':strToU8('const x = 1;'),'index.html':strToU8('<h1>Hi</h1>')}));
  assert.equal(strFromU8(archive['src/app.js']),'const x = 1;');
  assert.equal(strFromU8(archive['index.html']),'<h1>Hi</h1>');
});
