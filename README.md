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
| **Settings** | Choose the AI: Google Gemini (free tier), Anthropic API (paid) or Ollama (fully local). Output language. |

## Run it

Requires [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm start
```

Then open **Settings** and choose the AI:

- **Gemini (Free):** works out of the box if this copy has a built-in key (see below). Modes: *Balanced, thinking* (Gemini 3.5 Flash, default), *Deepest thinking* (2.5 Pro, slowest, tightest free limit), *Fastest* (3.1 Flash-Lite). Free-tier prompts may be used by Google, so avoid private material.
- **Ollama:** local and private. Install [Ollama](https://ollama.com), run `ollama pull llama3.1`, and pick it. Images are read with OCR.
- **Create new option:** paste any API key. StudyHelp recognises the provider from the key (Google Gemini, Anthropic, OpenAI, Groq, OpenRouter, Mistral, Cerebras, xAI, ... or any OpenAI-compatible URL), checks the key and lists the models you can use, and saves it as a new option you can switch to, edit or delete. If a key stops working, the app jumps straight to that option's edit page.

### Built-in key for "Gemini (Free)"

The repo is public, so the key is **not** in git. Copy `src/main/builtin-key.example.json` to `src/main/builtin-key.json` (git-ignored) and put a free Gemini key from [aistudio.google.com](https://aistudio.google.com) in it, then start or build the app. Without that file the option shows "Not included in this copy" and people can use Ollama or their own key.
A key shipped inside an app can be extracted by determined users, so use a throwaway key and move to a small proxy server before sharing widely.

- API keys are stored encrypted with your OS keychain when available and never sent to the UI.
- With a cloud option your material is sent to that company for processing; with Ollama nothing leaves your computer.
- Scanned PDFs: export the pages as images.

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
