# Atlas — free AI coding workspace

Atlas runs a downloadable Qwen or Qwen Coder model locally in your browser using WebLLM. No paid AI API key is needed. First use requires internet access to download model files, and generation needs a WebGPU-compatible Chrome or Edge browser with sufficient graphics memory.

## Run

On Windows, double-click **Start Atlas.cmd** with Node.js installed. The launcher opens the browser only after the server is ready. The server uses localhost port 4173 and tries the next available port if it is occupied.

Alternatively:

```sh
npm start
```

Open the URL printed in the terminal. Keep the server running. You can also host the complete `dist` folder on an HTTPS static host. Opening `index.html` as a file will not work. This repository update does not deploy a public website.

Type a question and choose **Start AI & send** to load the selected local model and send your question when it is ready. You can also load it first with **Start free AI**. Empty questions keep Send disabled. If loading fails or you cancel the download, your draft stays in the composer so you can retry. Chat scrolling follows new output unless you scroll up to read earlier messages.

Drafts save separately for each conversation and restore when you return. Pending edits are submitted to browser storage when you leave the page or switch tabs. Stop terminates the AI worker so even a stuck request releases the controls; your next question restarts the model using its cache where available. Idle worker crashes also return the AI to a restartable state. Streamed answers refresh at most about every 75 milliseconds, and file-size checks reuse cached sizes for unchanged files.

## Work with files

1. Choose **Add files** or **Add folder** in Project files, or enter a relative filename and click **Create file**. **Add folder** beside the chat composer imports into the same project workspace.
2. Select up to five file checkboxes to include their current editor contents in the next AI request.
3. Describe a focused task, such as “Fix the bug in app.js and show the complete corrected file.”
4. Review the response. **Use in editor** replaces the selected file's entire contents with that code block. **Undo suggestion** restores the previous contents.
5. Edit manually as needed, then use **Download file** or **Download project ZIP**. ZIP export preserves relative folder paths.

Messages appear in their own scrollable window above the composer. Every generated code block includes a filename field and **Write project file**: enter a relative path to create a new file or replace an existing file after confirmation. Choose **Target project** in Project files to put new files in that imported project; **All open projects** uses the full path you enter. Existing replacements support **Undo suggestion**.

**Search files and folders** filters imported file paths without changing editor contents or AI context selection. Searches ignore case, accept folder paths, and match multiple space-separated terms. Click a folder result to show its files, or **Clear** to return to the full list. Search covers files opened in Atlas; it does not search your entire computer. Folder entries are derived from their imported files, so empty folders do not appear. **Maximize workspace** hides the sidebar and extra header controls; **Exit maximized view** restores them.

Use **Save file to disk** to choose a destination in any project on your computer and write the current editor contents there. Chrome and Edge on localhost or HTTPS support this file picker. Other browsers can use **Download file** or **Download project ZIP**. Generated files are saved in Atlas first; disk writes happen when you choose a destination.

HTML, CSS, JavaScript, TypeScript, Python, Java, C/C++, Rust, Go, Markdown, JSON, YAML, XML, SVG, configuration files, extensionless files, and other UTF-8 or BOM-marked UTF-16 text are supported. Files are detected as text rather than relying on a fixed extension list. Binary files such as images, PDFs, Office documents, archives, audio, and executables are rejected with a visible explanation.

Limits: 1,000 project files, 2,000,000 characters / 4 MB per text file, 100 MB per workspace, and five selected project files as AI context. Dependency folders such as `node_modules`, `.git`, and `.venv` are skipped when opening folders.

Project files auto-save to IndexedDB in this browser and restore on refresh. Storage capacity depends on available browser quota and disk space. Download ZIP backups for safekeeping. Opening a file does not overwrite the original file on disk. Chats and notes are saved in this browser, with visible warnings if storage is unavailable or full. Conversations and reference libraries can be exported and imported as JSON backups; library imports skip identical notes. Saved conversations are limited to 30, with 80 messages each. Export and delete old conversations to make room.

## AI behavior

Coding mode focuses on code and excludes unrelated reference retrieval. General chat mode retrieves relevant library passages; library-only mode asks the model to answer only from those passages. Links are bookmarks and do not import a website's contents.

The small local models have a 4,096-token context. Atlas conservatively budgets input and visibly reports when it omits earlier messages, reference text, or file excerpts. It cannot fully review a large project in a single request. Start with short, specific tasks; try the balanced or larger Coder model if your GPU has enough memory.

Atlas suggests code and lets you create project files, apply code to its browser editor, and save files to a disk location you choose. It does not autonomously edit disk files, run terminals or tests, browse the live web, connect to GitHub, or perform Codex-style repository automation. Review and test generated code yourself.

## Development and checks

Runtime bundles are committed so the Windows launcher needs no dependency installation. To rebuild them or run the automated checks:

```sh
npm ci
npm run build
npm test
```

Tests cover reference validation and retrieval, persisted conversation validation, prompt budgets, text and UTF-16 file import, invalid paths and binary files, ZIP round trips, editor edits and AI suggestion undo, UI storage and error states, HTTP serving, HEAD requests, and path traversal.

The lightweight Qwen Coder model loaded and streamed responses on this computer in Edge, and Stop returned the UI to a usable state. It gave an incorrect answer to a simple file-fix test, so model output must not be treated as verified code. The balanced model downloaded, but browser control disconnected during initialization; its readiness and generation were not confirmed. Other model sizes and devices require their own hardware verification. See `THIRD_PARTY_NOTICES.md` for dependency information.

## Unified interface and deletion

Atlas uses a ChatGPT-style interface with centered chat and a bottom composer. Files opens the editor beside chat on large screens; AI settings, reference notes, and conversation controls stay in the same browser window. Delete a conversation with the ? beside its title. Delete file removes the selected file from Atlas. Choose a project folder and use Delete project to remove its imported files. Original files on disk are unchanged; Undo delete restores the last removed set while the tab remains open.
