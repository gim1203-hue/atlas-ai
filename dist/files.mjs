import {validateFile} from './workspace.mjs';
import {createProjectStorage,FILE_CHAR_LIMIT,FILE_BYTE_LIMIT,PROJECT_BYTE_LIMIT,PROJECT_FILE_LIMIT} from './project-storage.mjs';

export function safePath(name) {
  if (typeof name !== 'string') throw Error('Enter a filename.');
  const normalized = name.trim().replaceAll('\\','/');
  if (!normalized || normalized.length > 200 || normalized.startsWith('/') || /[<>:"|?*\x00-\x1f]/.test(normalized) || normalized.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) throw Error('Use a valid relative filename, such as src/app.js.');
  return normalized;
}
export async function readTextFile(file) {
  const name = safePath(file.webkitRelativePath || file.name);
  if (/\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|ico|svgz|zip|gz|7z|rar|exe|dll|wasm|mp[34]|mov|woff2?|ttf|otf|p12|pfx)$/i.test(name)) throw Error('binary format; choose a text or source-code file');
  if (file.size > FILE_BYTE_LIMIT) throw Error('too large (maximum 4 MB per text file)');
  const bytes = new Uint8Array(await file.arrayBuffer()); let text;
  try {
    // UTF-8 (with or without BOM) and BOM-marked UTF-16 source files.
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    text = new TextDecoder(encoding,{fatal:true}).decode(bytes);
  } catch {throw Error('unsupported encoding or binary data; use UTF-8 or BOM-marked UTF-16 text');}
  if (/[\x00-\x08\x0e-\x1f]/.test(text)) throw Error('binary content cannot be edited as text');
  return validateFile(name,text);
}

export function initFileWorkspace({notice,onAttach,onChange,storage = createProjectStorage()}) {
  const $ = id => document.getElementById(id);
  const project = []; let selected = null; let undoText = null; let reading = false;
  let restoring = true; let timer; let saving = Promise.resolve(); let saved = new Map(); let deleted = [];
  const bytes = text => new TextEncoder().encode(text).length;
  const sizeCache = new WeakMap();
  const fileBytes = file => {
    const cached = sizeCache.get(file);
    if (cached?.text === file.text) return cached.size;
    const size = bytes(file.text); sizeCache.set(file,{text:file.text,size}); return size;
  };
  const totalBytes = () => project.reduce((size,file)=>size+fileBytes(file),0);
  function storageStatus(text) {$('project-storage-status').textContent = text;}
  function persist() {
    clearTimeout(timer);
    const snapshot = project.map(file=>({...file}));
    const selection = selected;
    saving = saving.then(async () => {
      try {
        const changed = snapshot.filter(file => {const previous = saved.get(file.name); return !previous || previous.text !== file.text || previous.context !== file.context || previous.dirty !== file.dirty;});
        await storage.save(changed,selection);
        for (const file of changed) saved.set(file.name,file);
        storageStatus('Project saved in this browser · '+(totalBytes()/1000000).toFixed(1)+' / 100 MB workspace limit.');
      } catch (error) {storageStatus('Project not saved: '+error.message+' Download a ZIP backup.');}
    });
    return saving;
  }
  function queueSave() {storageStatus('Saving project…'); clearTimeout(timer); timer = setTimeout(persist,500);}
  function active() {return project.find(file => file.name === selected);}
  function render() {
    $('project-list').replaceChildren();
    const query = $('file-search').value.trim().replaceAll('\\','/').toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    const matches = project.filter(file=>terms.every(term=>file.name.toLowerCase().includes(term)));
    const folders = new Set();
    for (const file of matches) {
      const parts = file.name.split('/'); parts.pop();
      for (let i=1;i<=parts.length;i++) folders.add(parts.slice(0,i).join('/'));
    }
    for (const folder of [...folders].sort()) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'project-folder';
      button.textContent = '▸ '+folder+'/'; button.setAttribute('aria-label','Open folder '+folder);
      button.onclick = () => {$('file-search').value = folder+'/'; render();};
      $('project-list').append(button);
    }
    for (const file of matches) {
      const row = document.createElement('div'); row.className = 'project-row';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = file.context;
      checkbox.setAttribute('aria-label','Include '+file.name+' in AI context');
      checkbox.onchange = () => {
        if (checkbox.checked && project.filter(item => item.context).length >= 5) {checkbox.checked = false; notice('Select at most five files for AI context.'); return;}
        file.context = checkbox.checked; sync();
      };
      const button = document.createElement('button'); button.type = 'button'; button.textContent = file.name; button.className = file.name === selected ? 'selected' : '';
      button.onclick = () => {selected = file.name; undoText = null; $('file-editor').value = file.text; render(); queueSave();};
      row.append(checkbox,button); $('project-list').append(row);
    }
    $('search-count').textContent = matches.length+' / '+project.length+' files · '+folders.size+' folders';
    if (!matches.length) {const empty=document.createElement('p'); empty.className='file-list-empty'; empty.textContent=project.length ? 'No matching files or folders. Clear the search to see everything.' : 'Add files or a folder to get started.'; $('project-list').append(empty);}
    const file = active(); $('editing-file').textContent = file ? file.name : 'Choose a file or create one';
    $('file-editor').disabled = !file; $('download-file').disabled = !file; $('save-disk').disabled = !file; $('undo-edit').disabled = !file || undoText === null;
    $('download-project').disabled = !project.length; $('project-count').textContent = project.length+' files';
    $('delete-file').disabled = !file; $('delete-project').disabled = !project.length; $('restore-project').hidden = !deleted.length;
    const previousTarget = $('project-target').value;
    $('project-target').replaceChildren();
    const targets = [['all','All open projects'],...new Set(project.map(file=>file.name.includes('/') ? 'root:'+file.name.split('/')[0] : 'loose'))].map(item=>Array.isArray(item) ? item : [item,item === 'loose' ? 'Workspace files' : item.slice(5)]);
    for (const [value,label] of targets) {const option = document.createElement('option'); option.value = value; option.textContent = label; $('project-target').append(option);}
    if (targets.some(([value])=>value === previousTarget)) $('project-target').value = previousTarget;
    $('file-size').textContent = file ? file.text.length.toLocaleString()+' / 2,000,000 characters' : '';
  }
  function sync() {onAttach(project.filter(file => file.context).map(({name,text})=>({name,text}))); onChange?.(); if (!restoring) queueSave();}
  $('file-search').oninput = render;
  $('clear-file-search').onclick = () => {$('file-search').value=''; render(); $('file-search').focus();};
  async function importFiles(event) {
    if (reading || restoring) return; reading = true; $('open-files').disabled = true; $('open-folder').disabled = true;
    const skipped = []; let added = 0;
    try {
      for (const file of event.target.files) {
        const name = file.webkitRelativePath || file.name;
        if (name.split(/[\/\\]/).some(part => ['.git','node_modules','.venv','__pycache__'].includes(part))) continue;
        try {
          const imported = await readTextFile(file);
          if (project.some(item => item.name === imported.name)) throw Error('already open; your edited copy was kept');
          if (project.length >= PROJECT_FILE_LIMIT) throw Error('workspace limit of 1,000 files reached');
          if (totalBytes()+bytes(imported.text) > PROJECT_BYTE_LIMIT) throw Error('100 MB workspace size limit reached');
          project.push({...imported,context:project.filter(item => item.context).length < 5}); added++;
          if (!selected) {selected = imported.name; $('file-editor').value = imported.text;}
        } catch (error) {skipped.push(name+': '+error.message);}
      }
      $('file-search').value=''; $('project-workspace').open=true;
      render(); sync(); $('project-status').textContent = 'Opened '+added+' text files.'+(skipped.length ? ' Skipped '+skipped.length+': '+skipped.slice(0,6).join('; ') : '')+' Select the checkboxes for AI context.';
    } finally {event.target.value = ''; reading = false; $('open-files').disabled = false; $('open-folder').disabled = false;}
  }
  $('open-files').onchange = importFiles; $('open-folder').onchange = importFiles;
  $('create-file').onsubmit = event => {
    event.preventDefault();
    if (restoring) return;
    try {
      const name = targetPath($('new-filename').value); validateFile(name,'');
      if (project.length >= PROJECT_FILE_LIMIT) throw Error('The workspace can hold 1,000 files.');
      if (project.some(file => file.name === name)) throw Error('That file already exists. Select it from the list.');
      project.push({name,text:'',dirty:true,context:project.filter(file=>file.context).length < 5}); selected = name; undoText = null; $('file-editor').value = ''; $('new-filename').value = '';
      $('file-search').value=''; render(); sync(); $('project-status').textContent = 'Created '+name+'. Edit it below, or ask Atlas to generate its contents.';
    } catch (error) {$('project-status').textContent = error.message;}
  };
  $('file-editor').oninput = () => {
    const file = active(); if (!file) return;
    // Edits stay in the tab; opening files never overwrites their disk originals.
    const text = $('file-editor').value;
    if (text.length > FILE_CHAR_LIMIT || bytes(text) > FILE_BYTE_LIMIT || totalBytes()-fileBytes(file)+bytes(text) > PROJECT_BYTE_LIMIT) {$('file-editor').value = file.text; notice('This edit exceeds the file or workspace size limit.'); return;}
    file.text = $('file-editor').value; file.dirty = true; renderSize(); sync();
  };
  function renderSize() {const file = active(); $('file-size').textContent = file ? file.text.length.toLocaleString()+' / 2,000,000 characters' : '';}
  function targetPath(path) {
    const name = safePath(path); const target = $('project-target').value;
    const root = target.startsWith('root:') ? target.slice(5)+'/' : '';
    return safePath(root && !name.startsWith(root) ? root+name : name);
  }
  $('save-disk').onclick = async () => {
    const file = active(); if (!file) return;
    if (!window.showSaveFilePicker) {notice('This browser cannot save directly to a chosen folder. Use Download file or Download project ZIP.'); return;}
    // Capture the file before the picker opens, so changing selection cannot write another file.
    const {name,text} = file;
    let writable;
    try {
      const handle = await window.showSaveFilePicker({suggestedName:name.split('/').at(-1)});
      writable = await handle.createWritable(); await writable.write(text); await writable.close(); writable = null;
      if (file.text === text) file.dirty = false;
      sync(); $('project-status').textContent = 'Saved '+name+' to the disk location you chose.';
    } catch (error) {
      if (writable) {try {await writable.abort();} catch {}}
      if (error.name !== 'AbortError') notice('Could not save file: '+error.message);
    }
  };
  function saveBlob(name,blob) {const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('download-file').onclick = () => {const file = active(); if (file) {saveBlob(file.name.split('/').at(-1),new Blob([file.text],{type:'text/plain;charset=utf-8'})); file.dirty = false;}};
  $('download-project').onclick = async () => {
    try {
      const {zipSync,strToU8} = await import('./vendor/zip.mjs');
      const archive = Object.fromEntries(project.map(file => [file.name,strToU8(file.text)]));
      saveBlob('atlas-project.zip',new Blob([zipSync(archive)],{type:'application/zip'}));
      project.forEach(file => {file.dirty = false;});
      $('project-status').textContent = 'Downloaded all open files as a ZIP with their folder paths.';
    } catch (error) {$('project-status').textContent = 'Could not export project: '+error.message;}
  };
  $('undo-edit').onclick = () => {const file = active(); if (!file || undoText === null) return; file.text = undoText; $('file-editor').value = undoText; undoText = null; render(); sync(); $('project-status').textContent = 'Restored the file contents from before the AI suggestion.';};
  function deleteFiles(names) {
    clearTimeout(timer); deleted = project.filter(file=>names.includes(file.name));
    for (let i=project.length-1;i>=0;i--) if (names.includes(project[i].name)) project.splice(i,1);
    selected = project.some(file=>file.name === selected) ? selected : project[0]?.name || null;
    undoText = null; $('file-editor').value = active()?.text || ''; render();
    saving = saving.then(async()=>{
      try {await storage.remove(names,selected); for (const name of names) saved.delete(name);}
      catch (error) {storageStatus('Deletion could not be saved: '+error.message);}
    });
    sync(); $('project-status').textContent = 'Removed '+names.length+' files from Atlas. Original disk files are unchanged. Undo delete restores the last removed files.';
  }
  $('delete-file').onclick = () => {const file = active(); if (file && window.confirm('Remove '+file.name+' from Atlas? Original disk files will remain.')) deleteFiles([file.name]);};
  $('delete-project').onclick = () => {
    const target = $('project-target').value;
    const names = project.filter(file=>target === 'all' || target === 'loose' && !file.name.includes('/') || target.startsWith('root:') && file.name.startsWith(target.slice(5)+'/')).map(file=>file.name);
    if (names.length && window.confirm('Remove this project’s '+names.length+' files from Atlas storage? Original disk files will remain.')) deleteFiles(names);
  };
  $('restore-project').onclick = () => {
    if (project.length+deleted.length > PROJECT_FILE_LIMIT || totalBytes()+deleted.reduce((size,file)=>size+bytes(file.text),0) > PROJECT_BYTE_LIMIT) {notice('Not enough workspace room to undo deletion.'); return;}
    for (const file of deleted) if (!project.some(item=>item.name === file.name)) project.push(file);
    deleted = []; selected ||= project[0]?.name || null; $('file-editor').value = active()?.text || ''; render(); sync(); $('project-status').textContent = 'Deleted files restored.';
  };
  window.addEventListener('beforeunload',event => {if (project.some(file => file.dirty)) {event.preventDefault(); event.returnValue = '';}});
  document.addEventListener('visibilitychange',() => {if (!restoring && document.visibilityState === 'hidden') persist();});
  window.addEventListener('pagehide',() => {if (!restoring) persist();});
  render();
  $('open-files').disabled = true; $('open-folder').disabled = true; $('create-file').querySelector('button').disabled = true;
  storageStatus('Restoring saved project…');
  const ready = (async () => {
    try {
      const result = await storage.load();
      const names = new Set(); let size = 0;
      if (!Array.isArray(result.files) || result.files.length > PROJECT_FILE_LIMIT) throw Error('Invalid saved project.');
      const restored = result.files.map(file => {
        const name = safePath(file.name); validateFile(name,file.text);
        if (names.has(name)) throw Error('Duplicate saved filename.'); names.add(name);
        size += bytes(file.text); if (size > PROJECT_BYTE_LIMIT) throw Error('Saved project exceeds 100 MB.');
        return {...file,name,context:!!file.context,dirty:!!file.dirty};
      });
      project.push(...restored); let contexts = 0; for (const file of project) if (file.context && ++contexts > 5) file.context = false;
      selected = names.has(result.selected) ? result.selected : project[0]?.name || null;
      for (const file of project) saved.set(file.name,{...file});
      if (active()) $('file-editor').value = active().text;
      render(); sync(); storageStatus('Saved project restored · '+(size/1000000).toFixed(1)+' / 100 MB workspace limit.');
    } catch (error) {storageStatus('Project storage unavailable: '+error.message+' Download your work before closing.');}
    finally {restoring = false; $('open-files').disabled = false; $('open-folder').disabled = false; $('create-file').querySelector('button').disabled = false;}
  })();
  return {
    ready,
    importFiles,
    flush: persist,
    writeCode(path,text) {
      try {
        if (restoring) throw Error('Wait for saved project files to finish restoring.');
        const name = targetPath(path); validateFile(name,text);
        const existing = project.find(file=>file.name === name);
        if (!existing && project.length >= PROJECT_FILE_LIMIT) throw Error('The workspace can hold 1,000 files.');
        if (bytes(text) > FILE_BYTE_LIMIT || totalBytes()-bytes(existing?.text || '')+bytes(text) > PROJECT_BYTE_LIMIT) throw Error('This code exceeds the file or workspace size limit.');
        if (existing && !window.confirm('Replace all contents of '+name+' with this AI code?')) return;
        selected = name; undoText = existing ? existing.text : null;
        if (existing) {existing.text = text; existing.dirty = true;}
        else project.push({name,text,dirty:true,context:project.filter(file=>file.context).length < 5});
        $('file-editor').value = text; $('file-search').value=''; render(); sync(); $('project-workspace').open = true;
        $('project-status').textContent = 'Wrote '+name+' in Atlas. Review it, then choose Save file to disk or Download project ZIP.';
      } catch (error) {notice(error.message);}
    },
    applyCode(text,language) {
      const file = active();
      if (!file) {notice('Create or open a file in Project files first, then use the code block’s “Use in editor” button.'); return;}
      if (text.length > FILE_CHAR_LIMIT || bytes(text) > FILE_BYTE_LIMIT || totalBytes()-fileBytes(file)+bytes(text) > PROJECT_BYTE_LIMIT) {notice('This code block exceeds the file or project limit. Use Download instead.'); return;}
      undoText = file.text; file.text = text; file.dirty = true; $('file-editor').value = text; render(); sync();
      $('project-workspace').open = true; $('file-editor').focus();
      $('project-status').textContent = 'AI '+(language || 'code')+' suggestion placed in '+file.name+'. This replaces the entire editor contents. Review it before downloading; Undo suggestion restores the previous contents.';
    },
  };
}
