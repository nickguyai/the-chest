(() => {
  function sanitizeClone(node) {
    const clone = node.cloneNode(true);
    // Remove common non-content UI elements
    const selectorsToStrip = [
      'button',
      'svg',
      '[data-testid="copy-turn-action-button"]',
      '[data-testid^="copy-"]',
      '[data-testid*="action-button"]',
      '[role="toolbar"]',
      'textarea',
      'input',
      'select'
    ];
    selectorsToStrip.forEach(sel => clone.querySelectorAll(sel).forEach(el => el.remove()));

    // Replace code blocks with fenced code for readability
    clone.querySelectorAll('pre').forEach(pre => {
      const code = pre.querySelector('code');
      const langMatch = code && /language-([\w+-]+)/.exec(code.className || '');
      const lang = langMatch ? langMatch[1] : '';
      const codeText = code ? code.innerText : pre.innerText;
      const wrapper = document.createElement('div');
      wrapper.textContent = `\n\n\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`;
      pre.replaceWith(wrapper);
    });

    // Prefer primary content containers if present (user bubbles / markdown)
    const preferred = clone.querySelector('.whitespace-pre-wrap, .markdown, .prose');
    if (preferred) return preferred;
    return clone;
  }

  function extractTextFromMessageNode(messageNode) {
    const sanitized = sanitizeClone(messageNode);
    const text = sanitized.innerText
      .replace(/\s+Copy\s*$/gm, '') // trailing Copy labels from buttons
      .replace(/^(Copy|Like|Dislike|Edit)\s*/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return text;
  }

  function extractConversation(rolesFilter) {
    // Try to capture conversation title and url
    const title = document.title || '';
    const url = location.href;

    // Identify turn containers. ChatGPT commonly uses <article> with data attributes.
    const turnArticles = Array.from(document.querySelectorAll(
      'article[data-turn-id], article[data-testid^="conversation-turn"]'
    ));

    const messages = [];
    for (const article of turnArticles) {
      const msg = article.querySelector('[data-message-author-role]');
      if (!msg) continue;
      const role = msg.getAttribute('data-message-author-role');
      if (!role || (role !== 'user' && role !== 'assistant')) continue;

      if (Array.isArray(rolesFilter) && rolesFilter.length && !rolesFilter.includes(role)) {
        continue;
      }

      const text = extractTextFromMessageNode(msg);
      if (!text) continue;

      messages.push({
        role,
        text,
        turnId: article.getAttribute('data-turn-id') || article.getAttribute('data-testid') || null
      });
    }

    return { title, url, count: messages.length, rolesFilter: Array.isArray(rolesFilter) ? rolesFilter : null, messages };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'EXTRACT_CONVERSATION') {
      try {
        const rolesFilter = Array.isArray(message.roles) ? message.roles.filter(r => r === 'user' || r === 'assistant') : null;
        const data = extractConversation(rolesFilter);
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
      // Indicate async response not needed
      return true;
    }
  });
})();
