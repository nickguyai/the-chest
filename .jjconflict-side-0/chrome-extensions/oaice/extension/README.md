ChatGPT Conversation Exporter (Chrome Extension)

Overview
- Extracts messages you sent (user) and messages you received (assistant) directly from the ChatGPT web UI on `chat.openai.com` and `chatgpt.com`.
- Outputs a JSON payload that includes the page title, URL, count, and ordered messages.
- Popup provides quick actions to copy JSON, copy readable text, or download JSON.

Install (Developer Mode)
1. Open Chrome and go to `chrome://extensions`.
2. Enable Developer mode (top-right toggle).
3. Click “Load unpacked” and select this folder (`extension`).
4. Pin the extension (optional).

Usage
1. Open a ChatGPT conversation.
2. Scroll through the conversation so all messages you want are loaded.
3. Choose a role filter (All, User, Assistant) in the popup.
4. Click “Extract”.
4. Use Copy/Download actions as needed.

Notes
- The ChatGPT UI is dynamic and may change. This extension targets stable attributes like `data-message-author-role` and works with the current UI.
- If older messages don’t appear, scroll further to load them before extraction.
- Code blocks are exported as fenced code blocks using triple backticks.

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
