import {validateFile} from './workspace.mjs';

export function safePath(name) {
  if (typeof name !== 'string') throw Error('Enter a filename.');
  const normalized = name.trim().replaceAll('\\','/');
  if (!normalized || normalized.length > 200 || normalized.startsWith('/') || /[<>:"|?*\x00-\x1f]/.test(normalized) || normalized.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) throw Error('Use a valid relative filename, such as src/app.js.');
  return normalized;
}
export async function readTextFile(file) {
  const name = safePath(file.webkitRelativePath || file.name);
  if (file.size > 120000) throw Error('too large (maximum 120 KB per text file)');
  if (/\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|ico|svgz|zip|gz|7z|rar|exe|dll|wasm|mp[34]|mov|woff2?|ttf|otf|p12|pfx)$/i.test(name)) throw Error('binary format; choose a text or source-code file');
  const bytes = new Uint8Array(await file.arrayBuffer()); let text;
  try {
    // UTF-8 (with or without BOM) and BOM-marked UTF-16 source files.
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    text = new TextDecoder(encoding,{fatal:true}).decode(bytes);
  } catch {throw Error('unsupported encoding or binary data; use UTF-8 or BOM-marked UTF-16 text');}
  if (/[\x00-\x08\x0e-\x1f]/.test(text)) throw Error('binary content cannot be edited as text');
  return validateFile(name,text);
}

export function initFileWorkspace({notice,onAttach,onChange}) {
  const $ = id => document.getElementById(id);
  const project = []; let selected = null; let undoText = null; let reading = false;
  function active() {return project.find(file => file.name === selected);}
  function render() {
    $('project-list').replaceChildren();
    for (const file of project) {
      const row = document.createElement('div'); row.className = 'project-row';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = file.context;
      checkbox.setAttribute('aria-label','Include '+file.name+' in AI context');
      checkbox.onchange = () => {
        if (checkbox.checked && project.filter(item => item.context).length >= 5) {checkbox.checked = false; notice('Select at most five files for AI context.'); return;}
        file.context = checkbox.checked; sync();
      };
      const button = document.createElement('button'); button.type = 'button'; button.textContent = file.name; button.className = file.name === selected ? 'selected' : '';
      button.onclick = () => {selected = file.name; undoText = null; $('file-editor').value = file.text; render();};
      row.append(checkbox,button); $('project-list').append(row);
    }
    const file = active(); $('editing-file').textContent = file ? file.name : 'Choose a file or create one';
    $('file-editor').disabled = !file; $('download-file').disabled = !file; $('undo-edit').disabled = !file || undoText === null;
    $('download-project').disabled = !project.length; $('project-count').textContent = project.length+' files';
    $('file-size').textContent = file ? file.text.length.toLocaleString()+' / 30,000 characters' : '';
  }
  function sync() {onAttach(project.filter(file => file.context).map(({name,text})=>({name,text}))); onChange?.();}
  async function importFiles(event) {
    if (reading) return; reading = true; $('open-files').disabled = true; $('open-folder').disabled = true;
    const skipped = []; let added = 0;
    try {
      for (const file of event.target.files) {
        const name = file.webkitRelativePath || file.name;
        if (name.split(/[\/\\]/).some(part => ['.git','node_modules','.venv','__pycache__'].includes(part))) continue;
        try {
          const imported = await readTextFile(file);
          if (project.some(item => item.name === imported.name)) throw Error('already open; your edited copy was kept');
          if (project.length >= 100) throw Error('workspace limit of 100 files reached');
          if (project.reduce((size,item)=>size+item.text.length,0)+imported.text.length > 2000000) throw Error('workspace size limit reached');
          project.push({...imported,context:project.filter(item => item.context).length < 5}); added++;
          if (!selected) {selected = imported.name; $('file-editor').value = imported.text;}
        } catch (error) {skipped.push(name+': '+error.message);}
      }
      render(); sync(); $('project-status').textContent = 'Opened '+added+' text files.'+(skipped.length ? ' Skipped '+skipped.length+': '+skipped.slice(0,6).join('; ') : '')+' Select the checkboxes for AI context.';
    } finally {event.target.value = ''; reading = false; $('open-files').disabled = false; $('open-folder').disabled = false;}
  }
  $('open-files').onchange = importFiles; $('open-folder').onchange = importFiles;
  $('create-file').onsubmit = event => {
    event.preventDefault();
    try {
      const name = safePath($('new-filename').value); validateFile(name,'');
      if (project.length >= 100) throw Error('The workspace can hold 100 files.');
      if (project.some(file => file.name === name)) throw Error('That file already exists. Select it from the list.');
      project.push({name,text:'',dirty:true,context:project.filter(file=>file.context).length < 5}); selected = name; undoText = null; $('file-editor').value = ''; $('new-filename').value = '';
      render(); sync(); $('project-status').textContent = 'Created '+name+'. Edit it below, or ask Atlas to generate its contents.';
    } catch (error) {$('project-status').textContent = error.message;}
  };
  $('file-editor').oninput = () => {
    const file = active(); if (!file) return;
    // Edits stay in the tab; opening files never overwrites their disk originals.
    file.text = $('file-editor').value; file.dirty = true; renderSize(); sync();
  };
  function renderSize() {const file = active(); $('file-size').textContent = file ? file.text.length.toLocaleString()+' / 30,000 characters' : '';}
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
  window.addEventListener('beforeunload',event => {if (project.some(file => file.dirty)) {event.preventDefault(); event.returnValue = '';}});
  render();
  return {
    applyCode(text,language) {
      const file = active();
      if (!file) {notice('Create or open a file in Project files first, then use the code block’s “Use in editor” button.'); return;}
      if (text.length > 30000) {notice('This code block is too large for the editor. Use Download instead.'); return;}
      undoText = file.text; file.text = text; file.dirty = true; $('file-editor').value = text; render(); sync();
      $('project-workspace').open = true; $('file-editor').focus();
      $('project-status').textContent = 'AI '+(language || 'code')+' suggestion placed in '+file.name+'. This replaces the entire editor contents. Review it before downloading; Undo suggestion restores the previous contents.';
    },
  };
}
