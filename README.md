# StudyHelp

A desktop study assistant. Send it your lessons or tests and it builds summaries, tests, flash cards and "blurry notes" for you. Everything you create is saved locally so you can open it again later.

Runs locally as a desktop app (Electron). No server, no account. Your history lives in a folder on your computer.

## Features

| Section | What it does |
|---|---|
| **Lesson** | Upload files (PDF, Word, images/photos of notes, text) or paste text. Get the most important points (tick them off as you learn them), a structured summary, tables and diagrams when the material suits them, a searchable glossary and a quick check quiz. |
| **Test** | Three sources: **from files**, **from a previous lesson**, or **analyze my test**: upload a test you already took and get the rules you broke, your mistakes explained, and similar practice questions. Every test comes in 3 variants: **normal test**, **flash cards**, **blurry notes** (fill in the key terms only; verbs and filler words are never blanked). |
| **Revision** | Pick several lessons from history and/or send revision notes. Get one combined summary and a revision test (same 3 variants). |
| **History** | All lessons, tests and revisions with search and filters, attempt counts, **Select all** + **Delete selected**. |
| **Settings** | Choose the AI: Anthropic API (cloud) or Ollama (fully local). Output language. |

## Run it

Requires [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm start
```

Then open **Settings** and either paste an Anthropic API key, or select **Ollama** (install [Ollama](https://ollama.com), then e.g. `ollama pull llama3.1`).

- API key is stored encrypted with your OS keychain when available and never sent to the UI.
- With the Anthropic API your material is sent to Anthropic for processing; with Ollama nothing leaves your computer.
- Local models read images through OCR (language data downloads once). Scanned PDFs: export the pages as images.

Build an installer: `npm run dist`.  Run the tests: `npm test`.

## Project layout

```
src/main/      Electron main process: file extraction, AI providers, prompts, storage, jobs
src/renderer/  UI (plain HTML/CSS/JS, no build step)
test/          Unit + end-to-end tests (AI mocked)
```

## Roadmap

- Mobile version once the desktop one is solid.
- Spaced repetition for missed flash cards, progress charts per lesson.
