import {resources, initialNotes, retrieve, validateNotes} from './knowledge.mjs';
import {STORAGE_KEY, conversation, newWorkspace, restoreWorkspace, splitCode, buildRequest} from './workspace.mjs';
import {initFileWorkspace, readTextFile} from './files.mjs';

const $ = id => document.getElementById(id);
let state, engine = null, worker = null, busy = false, loading = false, stopped = false, files = [], readingFiles = false, loadEpoch = 0;
let cancelPendingLoad = null; let generationEpoch = 0; let cancelGeneration = null; let draftTimer;
const current = () => state.chats.find(chat => chat.id === state.active);
const notice = text => { $('chat-status').textContent = text; };
let projectFiles = [];
const fileWorkspace = initFileWorkspace({notice,onAttach:value => {projectFiles = value;}});
$('project-nav').onclick = () => {view('chat'); $('project-workspace').open = true; $('project-workspace').scrollIntoView({block:'start',behavior:'smooth'});};
$('toggle-files').onclick = () => {$('project-workspace').open = !$('project-workspace').open;};
$('maximize-workspace').onclick = () => {
  const expanded=document.body.classList.toggle('workspace-expanded');
  $('maximize-workspace').textContent=expanded ? 'Exit maximized view' : 'Maximize workspace';
  $('maximize-workspace').setAttribute('aria-pressed',String(expanded));
};
try { state = restoreWorkspace(localStorage.getItem(STORAGE_KEY), validateNotes, initialNotes); }
catch { state = newWorkspace(initialNotes); notice('Saved data could not be read. Starting a fresh session. Original saved data is retained until your next change.'); }
function save() {
  clearTimeout(draftTimer);
  current().draft = $('question').value;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); $('save-status').textContent = 'Saved in this browser. Export a backup to keep a separate copy.'; }
  catch { $('save-status').textContent = 'Browser storage is unavailable or full. Export your library and conversations before closing this tab.'; }
}
function view(name) {
  $('chat-view').hidden = name !== 'chat'; $('library-view').hidden = name !== 'library';
  $('page-title').textContent = name === 'chat' ? 'Atlas' : 'Reference library';
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.view === name));
}
document.querySelectorAll('.nav').forEach(b => b.onclick = () => view(b.dataset.view));
function download(name, value, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([type === 'application/json' ? JSON.stringify(value,null,2) : value], {type}));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
async function copy(text, button) {
  try { await navigator.clipboard.writeText(text); button.textContent = 'Copied'; setTimeout(() => button.textContent = 'Copy',1500); }
  catch { notice('Clipboard unavailable. Select the code or use Download.'); }
}
function renderBody(body, text) {
  body.replaceChildren();
  for (const part of splitCode(text)) {
    if (part.type === 'text') {const p = document.createElement('div'); p.className = 'answer-text'; p.textContent = part.text; body.append(p); continue;}
    const block = document.createElement('section'); block.className = 'code-block';
    const toolbar = document.createElement('div'); toolbar.className = 'code-toolbar';
    const language = document.createElement('span'); language.textContent = part.language || 'code';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Copy'; button.onclick = () => copy(part.text,button);
    const file = document.createElement('button'); file.type = 'button'; file.textContent = 'Download';
    const extensions = {javascript:'js',js:'js',typescript:'ts',ts:'ts',python:'py',py:'py',html:'html',css:'css',json:'json',bash:'sh',sh:'sh',sql:'sql',java:'java',cpp:'cpp',c:'c',rust:'rs',go:'go'};
    file.onclick = () => download('atlas-code.'+(extensions[part.language.toLowerCase()] || 'txt'), part.text,'text/plain');
    const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'Use in editor'; apply.onclick = () => fileWorkspace.applyCode(part.text,part.language);
    toolbar.append(language,button,file,apply); const pre = document.createElement('pre'); const code = document.createElement('code'); code.textContent = part.text;
    const saveForm = document.createElement('form'); saveForm.className = 'code-save-form';
    const path = document.createElement('input'); path.placeholder = 'src/app.js or index.html'; path.required = true; path.maxLength = 200; path.setAttribute('aria-label','Save code as project file');
    path.value = 'atlas-code.'+(extensions[part.language.toLowerCase()] || 'txt');
    const write = document.createElement('button'); write.type = 'submit'; write.textContent = 'Write project file';
    saveForm.onsubmit = event => {event.preventDefault(); fileWorkspace.writeCode(path.value,part.text);};
    saveForm.append(path,write);
    pre.append(code); block.append(toolbar,pre,saveForm); body.append(block);
  }
}
function sourceList(box,sources) {
  if (!sources?.length) return;
  const row = document.createElement('div'); row.className = 'source-list'; row.textContent = 'Reference passages supplied (check the originals): ';
  for (const [i,s] of sources.entries()) {
    const a = document.createElement(s.url ? 'a' : 'span'); a.textContent = '['+(i+1)+'] '+s.title+' ';
    if (s.url) {a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer';} row.append(a);
  }
  box.append(row);
}
function message(role,text,metadata = {}) {
  const box = document.createElement('article'); box.className = 'message '+role;
  const label = document.createElement('strong'); label.textContent = role === 'user' ? 'You' : 'Atlas';
  const body = document.createElement('div'); renderBody(body,text); box.append(label,body);
  if (metadata.files?.length) {const caption = document.createElement('small'); caption.textContent = 'Attached: '+metadata.files.join(', '); box.append(caption);}
  if (metadata.stopped) {const caption = document.createElement('small'); caption.textContent = 'Generation stopped. Response may be incomplete.'; box.append(caption);}
  sourceList(box,metadata.sources); $('messages').append(box); $('suggestions').hidden = true;
  document.querySelector('.chat-pane-title').hidden = true;
  $('messages').scrollTop = $('messages').scrollHeight;
  return {box,body};
}
function renderChats() {
  $('conversations').replaceChildren();
  for (const chat of state.chats) {
    const b = document.createElement('button'); b.className = 'conversation'+(chat.id === state.active ? ' selected' : ''); b.textContent = chat.title;
    b.disabled = busy; b.setAttribute('aria-pressed',String(chat.id === state.active));
    b.onclick = () => {save(); state.active = chat.id; $('question').value = chat.draft || ''; files = []; renderFiles(); renderMessages(); renderChats(); save(); updateControls(); notice(''); view('chat');};
    const row = document.createElement('div'); row.className = 'conversation-row';
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-conversation'; remove.textContent = '×'; remove.setAttribute('aria-label','Delete conversation '+chat.title); remove.disabled = busy;
    remove.onclick = () => deleteConversation(chat.id);
    row.append(b,remove); $('conversations').append(row);
  }
}
function renderMessages() {
  $('messages').replaceChildren(); $('suggestions').hidden = current().messages.length > 0;
  document.querySelector('.chat-pane-title').hidden = current().messages.length > 0;
  for (const m of current().messages) message(m.role,m.content,m);
}
function renderNotes() {
  $('count').textContent = state.notes.length; $('notes').replaceChildren();
  for (const n of state.notes) {
    const box = document.createElement('article'); box.className = 'note';
    const title = document.createElement('h3'); title.textContent = n.title;
    const p = document.createElement('p'); p.textContent = n.text.length > 350 ? n.text.slice(0,350)+'…' : n.text;
    const remove = document.createElement('button'); remove.className = 'outline'; remove.textContent = 'Remove reference';
    remove.onclick = () => {state.notes = state.notes.filter(x => x.id !== n.id); renderNotes(); save();}; box.append(title,p);
    if (n.url) {const a = document.createElement('a'); a.href = n.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Open source'; box.append(a);}
    box.append(remove); $('notes').append(box);
  }
}
function addNote(title,text,url = '') {
  if (state.notes.length >= 200) throw Error('Your library can hold 200 references. Export a backup before removing references.');
  const note = validateNotes([{title,text,url}])[0]; state.notes.push(note); renderNotes(); save(); return {id:note.id,title:note.title};
}
for (const [name,url,category] of resources) {
  const a = document.createElement('a'); a.className = 'resource'; a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = name;
  const s = document.createElement('span'); s.textContent = category; a.append(s); $('resources').append(a);
}
$('note-form').onsubmit = e => {
  e.preventDefault(); try {addNote($('note-title').value,$('note-text').value,$('note-url').value); $('note-form').reset(); $('library-status').textContent = 'Reference added. Check the browser save status below.';}
  catch (err) {$('library-status').textContent = err.message;}
};
$('export').onclick = () => download('atlas-reference-library.json',state.notes);
$('export-chat').onclick = () => download('atlas-conversation.json',{version:1,title:current().title,messages:current().messages});
function deleteConversation(id) {
  if (!window.confirm('Delete this saved conversation? Export it first if you want a backup.')) return;
  state.chats = state.chats.filter(chat => chat.id !== id);
  if (!state.chats.length) state.chats.push(conversation());
  if (!state.chats.some(chat=>chat.id === state.active)) state.active = state.chats[0].id;
  $('question').value = current().draft || '';
  renderChats(); renderMessages(); save(); updateControls(); notice('Conversation deleted.');
}
$('delete-chat').onclick = () => deleteConversation(state.active);
$('import-chat').onchange = async event => {
  try {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 7000000) throw Error('Choose a conversation smaller than 7 MB.');
    if (state.chats.length >= 30) throw Error('The workspace already has 30 conversations. Export and delete an old one first.');
    const value = JSON.parse(await file.text()); if (value.version !== 1) throw Error('Unsupported conversation format.');
    const chat = {...conversation(),title:value.title,messages:value.messages};
    const restored = restoreWorkspace(JSON.stringify({...state,chats:[chat],active:chat.id}),validateNotes,initialNotes);
    save(); state.chats.unshift(restored.chats[0]); state.active = chat.id; $('question').value = current().draft || ''; renderChats(); renderMessages(); save(); updateControls(); notice('Conversation imported.'); view('chat');
  } catch (error) {notice('Import failed: '+error.message);} finally {event.target.value = '';}
};
$('import').onchange = async e => {
  try {
    const f = e.target.files[0]; if (!f) return; if (f.size > 7000000) throw Error('Choose a library smaller than 7 MB.');
    const imported = validateNotes(JSON.parse(await f.text()));
    let added = 0;
    const unique = imported.filter((n,index) => !state.notes.some(x => x.title === n.title && x.text === n.text && x.url === n.url) && !imported.slice(0,index).some(x => x.title === n.title && x.text === n.text && x.url === n.url));
    if (state.notes.length+unique.length > 200) throw Error('The combined library would exceed 200 references.');
    state.notes.push(...unique); added = unique.length; renderNotes(); save();
    $('library-status').textContent = 'Imported '+added+' references; skipped '+(imported.length-added)+' duplicates.';
  } catch (err) {$('library-status').textContent = 'Import failed: '+err.message;} finally {e.target.value = '';}
};
function renderFiles() {
  $('attached-files').replaceChildren();
  for (const [i,file] of files.entries()) {
    const row = document.createElement('div'); row.className = 'attached-file';
    const caption = document.createElement('span'); caption.textContent = file.name+' · '+file.text.length.toLocaleString()+' characters';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Remove'; b.disabled = busy; b.setAttribute('aria-label','Remove '+file.name);
    b.onclick = () => {files.splice(i,1); renderFiles();}; row.append(caption,b); $('attached-files').append(row);
  }
}
$('code-files').onchange = async e => {
  readingFiles = true; updateControls();
  try {
    const selected = [...e.target.files]; if (selected.length+files.length > 5) throw Error('Attach at most five text files at a time.');
    const imported = [];
    for (const f of selected) {imported.push(await readTextFile(f));}
    files.push(...imported); renderFiles(); notice('Files attached locally. Any context omitted by the small model will be shown before the answer.');
  } catch (err) {notice(err.message);} finally {e.target.value = ''; readingFiles = false; updateControls();}
};
function updateControls() {
  $('send').disabled = !$('question').value.trim() || busy || loading || readingFiles;
  $('send').textContent = engine ? 'Send' : 'Start AI & send';
  $('question').disabled = loading;
  $('load').disabled = busy || loading; $('model').disabled = busy || loading;
  $('stop').hidden = !busy; $('stop').disabled = stopped; $('cancel-load').hidden = !loading; $('new-chat').disabled = busy || loading || readingFiles;
  $('mode').disabled = busy; $('library-only').disabled = busy; $('code-files').disabled = busy || readingFiles;
  $('attach-label').classList.toggle('disabled',busy || readingFiles);
  $('attach-folder').disabled = busy || loading || readingFiles;
  $('attach-folder-label').classList.toggle('disabled',busy || loading || readingFiles);
  $('export-chat').disabled = busy; $('unload').hidden = !engine; $('unload').disabled = busy || loading;
  $('delete-chat').disabled = busy || loading; $('import-chat').disabled = busy || loading;
  document.querySelectorAll('.conversation').forEach(b => b.disabled = busy || loading || readingFiles);
  document.querySelectorAll('.delete-conversation').forEach(b => b.disabled = busy || loading);
  document.querySelectorAll('[data-question]').forEach(b => b.disabled = busy || loading);
  $('attached-files').querySelectorAll('button').forEach(b => b.disabled = busy);
}
$('attach-folder').onchange = async event => {
  if (busy || loading || readingFiles) return;
  readingFiles=true; updateControls();
  try {await fileWorkspace.ready; await fileWorkspace.importFiles(event); notice('Folder added to Project files. Select up to five files for the next AI request.');}
  catch (error) {notice('Could not add folder: '+error.message);}
  finally {event.target.value=''; readingFiles=false; updateControls();}
};
function disposeEngine() {
  loadEpoch++; cancelPendingLoad?.(); cancelPendingLoad = null; worker?.terminate(); worker = null; engine = null; loading = false; $('progress').hidden = true; $('load').textContent = 'Start free AI'; updateControls();
}
$('cancel-load').onclick = () => {disposeEngine(); $('status').textContent = 'Download cancelled. You can start again; cached model files may be reused.';};
$('unload').onclick = () => {disposeEngine(); $('status').textContent = 'AI unloaded. Choose a model and start again when ready.';};
$('model').value = state.model; $('mode').value = state.mode;
$('model').onchange = () => {disposeEngine(); state.model = $('model').value; save(); $('status').textContent = 'Model changed. Start free AI to load your selection.';};
$('mode').onchange = () => {state.mode = $('mode').value; save(); notice(state.mode === 'code' ? 'Coding mode: write, explain and debug code. Attach a small file for context.' : 'General chat: relevant library passages are included automatically.');};
$('load').onclick = async () => {
  worker?.terminate(); worker = null; engine = null;
  loading = true; const epoch = ++loadEpoch; updateControls();
  try {
    if (!window.isSecureContext) throw Error('Open Atlas on localhost or HTTPS to enable browser AI.');
    if (!navigator.gpu) throw Error('WebGPU is unavailable. Use Chrome or Edge on compatible graphics hardware.');
    const adapter = await navigator.gpu.requestAdapter(); if (epoch !== loadEpoch) return;
    if (!adapter) throw Error('No compatible graphics device was found. Check hardware acceleration in Chrome or Edge.');
    $('status').textContent = 'Preparing your AI. First use downloads model files; keep this tab open.'; $('progress').hidden = false; $('progress').value = 0;
    const webllm = await import('./vendor/webllm.mjs'); if (epoch !== loadEpoch) return;
    worker = new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
    const watchedWorker = worker;
    worker.addEventListener('error',event => {
      if (worker !== watchedWorker || loading || busy) return;
      disposeEngine(); $('status').textContent = 'AI stopped unexpectedly. Send your question to restart it.';
      notice(event.message || 'The AI worker stopped. Your saved work is retained.');
    });
    const pending = webllm.CreateWebWorkerMLCEngine(worker,$('model').value,{initProgressCallback:r => {
      if (epoch !== loadEpoch) return; $('status').textContent = r.text; $('progress').value = r.progress;
    }},{context_window_size:4096});
    let timer; let errorListener;
    const failure = new Promise((_,reject) => {
      cancelPendingLoad = () => reject(Error('Loading cancelled.'));
      errorListener = event => reject(Error(event.message || 'The AI worker failed.'));
      worker.addEventListener('error',errorListener,{once:true});
      timer = setTimeout(() => reject(Error('Loading timed out. Check your connection and try the lightweight model.')),10*60*1000);
    });
    const pendingWorker = worker;
    try {const ready = await Promise.race([pending,failure]); if (epoch !== loadEpoch) return; engine = ready;}
    finally {clearTimeout(timer); pendingWorker.removeEventListener('error',errorListener); cancelPendingLoad = null;}
    $('status').textContent = 'Ready. AI runs on this device. Use focused questions and short code excerpts.'; $('load').textContent = 'Reload AI'; $('progress').hidden = true;
    $('ai-settings').open = false;
  } catch (err) {if (epoch !== loadEpoch) return; disposeEngine(); $('status').textContent = 'Could not start AI: '+err.message;}
  finally {if (epoch === loadEpoch) {loading = false; updateControls();}}
};
async function ask(question) {
  if (!engine || busy || loading) throw Error('Start the free AI before sending a question.');
  const strict = $('library-only').checked;
  const sources = strict || state.mode === 'chat' ? retrieve(question,state.notes) : [];
  const contextFiles = [...projectFiles,...files].filter((file,index,all)=>all.findIndex(other=>other.name === file.name) === index);
  const request = buildRequest({question,history:current().messages,files:contextFiles,sources,mode:state.mode,strict});
  const chat = current(); if (chat.messages.length >= 78) throw Error('This conversation is full. Export it and start a new conversation.');
  const user = {role:'user',content:question.trim(),files:contextFiles.map(f => f.name)}; chat.messages.push(user); message(user.role,user.content,user);
  if (chat.title === 'New conversation') chat.title = question.trim().slice(0,55);
  $('question').value = ''; const answer = {role:'assistant',content:''}; const result = message('assistant','Thinking…'); chat.messages.push(answer); save(); renderChats();
  if (strict && !sources.length) {answer.content = 'I could not find relevant passages in your library. Add reference text or turn off “Answer only from my library.”'; renderBody(result.body,answer.content); save(); updateControls(); return;}
  busy = true; stopped = false; updateControls(); notice(request.warnings.join(' '));
  let finishReason;
  const generation = ++generationEpoch; const activeWorker = worker; let timer; let errorListener; let lastPaint = 0;
  try {
    const run = async () => {
      const stream = await engine.chat.completions.create({messages:request.messages,stream:true,max_tokens:900,temperature:0.2});
      for await (const chunk of stream) {
        if (stopped || generation !== generationEpoch) break;
        answer.content += chunk.choices[0]?.delta?.content || ''; finishReason = chunk.choices[0]?.finish_reason || finishReason;
        if (performance.now()-lastPaint >= 75) {
          const log = $('messages'); const follow = log.scrollHeight-log.scrollTop-log.clientHeight < 120;
          result.body.textContent = answer.content || 'Thinking…';
          if (follow) log.scrollTop = log.scrollHeight;
          lastPaint = performance.now();
        }
      }
    };
    const failure = new Promise((_,reject) => {
      errorListener = event => {disposeEngine(); reject(Error(event.message || 'The AI worker stopped unexpectedly.'));};
      activeWorker.addEventListener('error',errorListener,{once:true});
      timer = setTimeout(() => {disposeEngine(); reject(Error('Generation timed out. Restart the AI with a shorter question or smaller model.'));},180000);
    });
    const cancelled = new Promise(resolve => {cancelGeneration = resolve;});
    await Promise.race([run(),failure,cancelled]);
    if (stopped) {answer.stopped = true; answer.content ||= 'Generation stopped before a response was produced.';}
    else if (!answer.content.trim()) throw Error('The model returned an empty response. Try a shorter question.');
    renderBody(result.body,answer.content); answer.sources = sources; sourceList(result.box,sources);
    if (stopped || finishReason === 'length') {
      const caption = document.createElement('small'); caption.textContent = stopped ? 'Generation stopped. Response may be incomplete.' : 'Output limit reached. Ask for the remaining section.'; result.box.append(caption);
    }
    if (stopped) notice('Generation stopped. You can send another question.');
  } catch (err) {
    answer.failed = true; answer.content = (answer.content ? answer.content+'\n\n' : '')+'The AI could not finish: '+err.message+' Try a shorter question, unload the AI, or choose the lightweight model.';
    renderBody(result.body,answer.content); notice('Generation failed. Your question is saved; you can retry.');
  } finally {cancelGeneration = null; generationEpoch++; clearTimeout(timer); activeWorker.removeEventListener('error',errorListener); busy = false; save(); updateControls(); renderChats();}
}
$('chat-form').onsubmit = async e => {
  e.preventDefault();
  if (busy || loading || readingFiles) return;
  const question = $('question').value;
  if (!question.trim()) {notice('Enter a question before sending.'); return;}
  try {
    if (!engine) {
      $('ai-settings').open = true;
      notice('Starting your local AI. Your question stays here until the model is ready.');
      await $('load').onclick();
      if (!engine) {notice($('status').textContent); return;}
    }
    await ask(question);
  } catch (err) {notice(err.message);}
};
$('question').oninput = () => {updateControls(); clearTimeout(draftTimer); draftTimer = setTimeout(save,300);};
$('question').onkeydown = e => {if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {e.preventDefault(); if (!$('send').disabled) $('chat-form').requestSubmit();}};
document.querySelectorAll('[data-question]').forEach(b => b.onclick = () => {$('question').value = b.dataset.question; updateControls(); $('question').focus();});
$('stop').onclick = () => {
  if (!busy) return;
  stopped = true; generationEpoch++; disposeEngine(); cancelGeneration?.();
  notice('Generation stopped. Send another question to restart the AI.');
};
$('new-chat').onclick = () => {
  if (state.chats.length >= 30) {notice('You have 30 saved conversations. Export a backup and reuse an existing conversation.'); view('chat'); return;}
  save(); const chat = conversation(); state.chats.unshift(chat); state.active = chat.id; files = []; $('question').value = '';
  renderChats(); renderMessages(); renderFiles(); save(); updateControls(); notice(''); view('chat');
};
for (const chat of state.chats) for (const m of chat.messages) if (m.role === 'assistant' && !m.content) {m.content = 'The previous response was interrupted by a reload.'; m.failed = true;}
$('question').value = current().draft || '';
renderChats(); renderMessages(); renderNotes(); updateControls();
document.addEventListener('visibilitychange',() => {if (document.visibilityState === 'hidden') save();});
window.addEventListener('pagehide',() => {if (busy) current().messages.at(-1).stopped = true; save(); worker?.terminate();});

if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  for (const tool of [
    {name:'add_reference',title:'Add a reference',description:'Add a titled text reference to the library saved in this browser.',inputSchema:{type:'object',properties:{title:{type:'string'},text:{type:'string'},url:{type:'string'}},required:['title','text'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input => addNote(input.title,input.text,input.url || '')},
    {name:'search_references',title:'Search references',description:'Retrieve matching passages from the reference library.',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:input => {if (typeof input.query !== 'string' || !input.query.trim()) throw Error('A query is required.'); return retrieve(input.query,state.notes);}},
  ]) {try {Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});} catch {}}
  window.addEventListener('pagehide',() => lifecycle.abort(),{once:true});
}
