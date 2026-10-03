import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createProjectStorage} from '../dist/project-storage.mjs';
import {readTextFile} from '../dist/files.mjs';
test('large JSX and lockfiles import and project data survives storage reload and deletion',async()=>{
  const factory = new IDBFactory();
  const file = await readTextFile(new File(['export const data = "'+'x'.repeat(250000)+'";'],'LiveApp.jsx'));
  const lock = await readTextFile(new File(['{"data":"'+'y'.repeat(150000)+'"}'],'package-lock.json'));
  const storage = createProjectStorage(factory);
  await storage.save([file,lock],file.name);
  const reopened = createProjectStorage(factory);
  assert.equal((await reopened.load()).files.find(item=>item.name === file.name).text,file.text);
  await reopened.remove([file.name],lock.name);
  assert.deepEqual((await storage.load()).files.map(item=>item.name),[lock.name]);
  await storage.save([file],file.name);
  assert.equal((await reopened.load()).files.length,2);
});
