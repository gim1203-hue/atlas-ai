# Atlas — your personal AI

A custom website using WebLLM and an open Qwen model. No paid AI API key is required. A WebGPU-compatible browser and sufficient graphics memory are required. Model files download from Hugging Face on first use; this uses your existing internet connection and device resources.

Click **Start free AI**, wait for the model download, then ask questions. In **Reference library**, add actual text and an optional source link. Links are bookmarks, not integrations. The app retrieves relevant passages and supplies them to the model, with source links. Library-only mode asks the model to restrict answers to the supplied passages, but a small model may still make mistakes.

Notes and conversations are session-only. Use **Export library** to retain notes and **Import library** to restore them. No private databases, live web search, cloud database connection, subscriptions, or credentials are included. The reference library includes a few dated summaries and all the user's supplied website bookmarks.

On this Windows computer, double-click **Start Atlas.cmd**. Node.js is already installed here. Keep the terminal window open while using the app. Alternatively, serve the `dist` directory over HTTP or HTTPS. Do not open index.html directly as a file. Deploy `dist` to a static host if desired. Private Sites publishing was attempted but blocked by the session's sandbox approval policy; no live hosted deployment has been confirmed.

JavaScript syntax, reference retrieval, library import validation and local HTTP serving were checked successfully. AI generation has not been verified on the user's graphics hardware. WebMCP validation was unavailable because no supported browser context was opened. If WebGPU is unavailable, the app reports that limitation instead of simulating an answer.
