ChatGPT Conversation Exporter (Chrome Extension)

Overview
- Extracts messages you sent (user) and messages you received (assistant) directly from the ChatGPT web UI on `chat.openai.com` and `chatgpt.com`.
- Outputs a JSON payload that includes the page title, URL, count, and ordered messages.
- Popup provides quick actions to copy JSON, copy readable text, or download JSON.
 - In-page Super Tool provides a Docs panel to download assistant Markdown sections as `.md` files.

Install (Developer Mode)
1. Open Chrome and go to `chrome://extensions`.
2. Enable Developer mode (top-right toggle).
3. Click “Load unpacked” and select this folder (`extension`).
4. Pin the extension (optional).

Usage
- In-page button
  1. Open a ChatGPT conversation.
  2. Scroll to load all messages you want to include.
  3. Click the "Export" button that appears just above the composer at the bottom of the page.
  4. Choose format (JSON or Text) and range (All/User/Assistant), then Export to download.

- Popup (browser action)
  1. Open a ChatGPT conversation.
  2. Scroll through the conversation so all messages you want are loaded.
  3. Choose a role filter (All, User, Assistant) in the popup.
  4. Click “Extract”.
  5. Use Copy/Download actions as needed.

- Super Tool (Docs panel)
  1. Click the "Super Tool" button next to Export above the composer.
  2. In Docs, review the list of Markdown sections detected in assistant messages.
  3. Deselect any you don’t want, or use Select All.
  4. Click "Download Selected" to save `.md` files into a folder named after the page title under your default Downloads directory.

Notes
- The ChatGPT UI is dynamic and may change. This extension targets stable attributes like `data-message-author-role` and works with the current UI.
- If older messages don’t appear, scroll further to load them before extraction.
- Code blocks are exported as fenced code blocks using triple backticks.
 - The Docs panel uses a simple text-based Markdown approximation to maximize compatibility without external libraries.

Data Shape
{
  "title": "<page title>",
  "url": "<conversation url>",
  "count": 3,
  "rolesFilter": ["user"] | ["assistant"] | null,
  "messages": [
    { "role": "user", "text": "...", "turnId": "..." },
    { "role": "assistant", "text": "...", "turnId": "..." }
  ]
}
