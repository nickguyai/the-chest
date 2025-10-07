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

  // Public API used by popup and in-page UI
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

  // ========== In-page UI injection ==========
  const STYLE_ID = 'oai-export-style';
  const BTN_ID = 'oai-export-btn';
  const BAR_ID = 'oai-export-bar';
  const MODAL_ID = 'oai-export-modal';
  const OVERLAY_ID = 'oai-export-overlay';
  const SUPER_BTN_ID = 'oai-super-btn';
  const SUPER_MODAL_ID = 'oai-super-modal';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --oai-charcoal: #2D3748;
        --oai-white: #FFFFFF;
        --oai-sakura: #FFB7C5;
        --oai-cherry: #FF6B9D;
        --oai-sky: #87CEEB;
        --oai-stone: #718096;
        --oai-bg: #FFF5F7;
        --oai-bg-dark: #1A202C;
      }

      .oai-pixel-btn {
        padding: 8px 24px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
        font-size: 14px;
        border: 2px solid var(--oai-charcoal);
        background: var(--oai-white);
        color: var(--oai-charcoal);
        cursor: pointer;
        position: relative;
        box-shadow: 4px 4px 0 var(--oai-charcoal);
        transition: transform 0.1s ease, box-shadow 0.1s ease;
        text-transform: uppercase;
      }
      .oai-pixel-btn:hover { transform: translate(2px, 2px); box-shadow: 2px 2px 0 var(--oai-charcoal); }
      .oai-pixel-btn:active { transform: translate(4px, 4px); box-shadow: none; }
      .oai-pixel-btn.primary { background: var(--oai-sakura); }
      .oai-pixel-btn.secondary { background: var(--oai-white); }

      /* Bar above composer */
      #${BAR_ID} {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
        margin: 8px 0 10px 0;
        z-index: 12;
      }

      /* Modal overlay */
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.35);
        backdrop-filter: blur(1px);
        z-index: 99999;
        display: none;
      }
      #${OVERLAY_ID}.open { display: block; }

      /* Modal card(s) */
      #${MODAL_ID}, #${SUPER_MODAL_ID} {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--oai-white);
        color: var(--oai-charcoal);
        border: 3px solid var(--oai-charcoal);
        padding: 24px;
        min-width: 320px;
        max-width: 90vw;
        box-shadow: 6px 6px 0 var(--oai-charcoal);
        z-index: 100000;
        display: none;
      }
      /* Super modal as flex column with scrollable body */
      #${SUPER_MODAL_ID} {
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      @media (prefers-color-scheme: dark) {
        #${MODAL_ID}, #${SUPER_MODAL_ID} { background: #303030; color: #f0f0f0; }
        .oai-pixel-btn { background: #f9f9f9; color: #111; }
        .oai-pixel-btn.primary { background: var(--oai-cherry); color: #fff; }
      }
      #${MODAL_ID} h3, #${SUPER_MODAL_ID} h3 {
        margin: 0 0 16px 0;
        font-size: 16px;
        line-height: 1.4;
        text-transform: uppercase;
      }
      #${MODAL_ID} .oai-row, #${SUPER_MODAL_ID} .oai-row { margin: 12px 0; }
      #${MODAL_ID} .oai-options, #${SUPER_MODAL_ID} .oai-options { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
      #${MODAL_ID} .oai-actions, #${SUPER_MODAL_ID} .oai-actions { display: flex; gap: 12px; justify-content: space-between; align-items: center; margin-top: 8px; }
      #${MODAL_ID} label, #${SUPER_MODAL_ID} label { display: inline-flex; gap: 8px; align-items: center; cursor: pointer; }

      /* Docs list */
      #${SUPER_MODAL_ID} .oai-docs-list { overflow: visible; border: 2px solid var(--oai-charcoal); padding: 8px; }
      #${SUPER_MODAL_ID} .oai-doc-item { display: grid; grid-template-columns: auto 1fr; gap: 8px; padding: 8px; border-bottom: 2px solid var(--oai-charcoal); }
      #${SUPER_MODAL_ID} .oai-doc-title { font-weight: 600; }
      #${SUPER_MODAL_ID} .oai-doc-preview { color: var(--oai-stone); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #${SUPER_MODAL_ID} .oai-badge { display:inline-block; margin-inline-start:8px; padding:2px 6px; background: var(--oai-sky); border:2px solid var(--oai-charcoal); font-size:10px; font-weight:600; }

      /* Scrollable body with sticky actions */
      #${SUPER_MODAL_ID} .oai-modal-body { flex: 1; overflow: auto; }
      #${SUPER_MODAL_ID} .oai-modal-body .oai-actions { position: sticky; top: 0; background: inherit; z-index: 2; padding-bottom: 8px; }
    `;
    document.documentElement.appendChild(style);
  }

  function findBottomContainer() {
    // Prefer the explicit id first
    let container = document.getElementById('thread-bottom-container');
    if (container) return container;
    // Fallback: look for class containing thread-bottom-container
    container = document.querySelector('[class*="thread-bottom-container"]');
    return container || null;
  }

  function placeBarAboveComposer() {
    const bottom = findBottomContainer();
    if (!bottom) return false;
    const composerForm = bottom.querySelector('form[data-type="unified-composer"]') || bottom.querySelector('form');
    if (!composerForm) return false;
    if (document.getElementById(BAR_ID)) return true;

    const bar = document.createElement('div');
    bar.id = BAR_ID;
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className = 'oai-pixel-btn primary';
    btn.textContent = 'Export';
    btn.addEventListener('click', openExportModal);
    bar.appendChild(btn);

    const superBtn = document.createElement('button');
    superBtn.id = SUPER_BTN_ID;
    superBtn.type = 'button';
    superBtn.className = 'oai-pixel-btn secondary';
    superBtn.textContent = 'Super Tool';
    superBtn.addEventListener('click', openSuperModal);
    bar.appendChild(superBtn);

    // Insert just before the composer form, within its parent
    const parent = composerForm.parentElement || bottom;
    parent.insertBefore(bar, composerForm);
    return true;
  }

  function ensureBar() {
    ensureStyles();
    placeBarAboveComposer();
  }

  function closeExportModal() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.classList.remove('open');
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.style.display = 'none';
  }

  function openExportModal() {
    ensureStyles();
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeExportModal();
      });
      document.body.appendChild(overlay);
    }

    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = MODAL_ID;
      modal.innerHTML = `
        <h3>Export Conversation</h3>
        <div class="oai-row">
          <div class="oai-label">Format</div>
          <div class="oai-options" role="radiogroup" aria-label="Export format">
            <label><input type="radio" name="oai-format" value="json" checked> JSON</label>
            <label><input type="radio" name="oai-format" value="text"> Text</label>
          </div>
        </div>
        <div class="oai-row">
          <div class="oai-label">Range</div>
          <div class="oai-options" role="radiogroup" aria-label="Export range">
            <label><input type="radio" name="oai-range" value="all" checked> All</label>
            <label><input type="radio" name="oai-range" value="user"> User</label>
            <label><input type="radio" name="oai-range" value="assistant"> Assistant</label>
          </div>
        </div>
        <div class="oai-actions">
          <button type="button" class="oai-pixel-btn secondary" id="oai-cancel">Cancel</button>
          <button type="button" class="oai-pixel-btn primary" id="oai-confirm">Export</button>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('#oai-cancel').addEventListener('click', closeExportModal);
      modal.querySelector('#oai-confirm').addEventListener('click', handleExportConfirm);
    }
    // Ensure visible on open
    modal.style.display = 'block';
    overlay.classList.add('open');
  }

  function getSelectedFormat() {
    const el = document.querySelector('input[name="oai-format"]:checked');
    return el ? el.value : 'json';
  }
  function getSelectedRange() {
    const el = document.querySelector('input[name="oai-range"]:checked');
    const v = el ? el.value : 'all';
    if (v === 'user') return ['user'];
    if (v === 'assistant') return ['assistant'];
    return null; // all
  }

  function asTextList(messages) {
    return messages
      .map(m => `${m.role.toUpperCase()}:\n${m.text}`)
      .join('\n\n---\n\n');
  }

  function sanitizeFilename(name) {
    return (name || 'chatgpt-conversation')
      .replace(/[^a-z0-9\-_. ]/gi, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase();
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleExportConfirm() {
    try {
      const roles = getSelectedRange();
      const format = getSelectedFormat();
      const data = extractConversation(roles);
      const ts = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');
      const base = sanitizeFilename(data.title) || 'chatgpt-conversation';
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        triggerDownload(blob, `${base}_${ts}.json`);
      } else {
        const text = asTextList(data.messages || []);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        triggerDownload(blob, `${base}_${ts}.txt`);
      }
      closeExportModal();
    } catch (err) {
      console.error('Export failed:', err);
    }
  }

  // ===== Super Tool (Docs panel) =====
  function closeSuperModal() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.classList.remove('open');
    const modal = document.getElementById(SUPER_MODAL_ID);
    if (modal) modal.style.display = 'none';
  }

  function getAssistantArticles() {
    const articles = Array.from(document.querySelectorAll('article[data-turn-id], article[data-testid^="conversation-turn"]'));
    return articles.filter(a => a.querySelector('[data-message-author-role="assistant"]'));
  }

  function collectMarkdownSections() {
    const sections = [];
    const seen = new Set();
    for (const article of getAssistantArticles()) {
      const containers = Array.from(article.querySelectorAll('[data-message-author-role="assistant"]'));
      for (const container of containers) {
        const messageId = container.getAttribute('data-message-id') || null;
        // Collect any element with both classes (not just div), at any depth
        const allParts = Array.from(container.querySelectorAll('.markdown.prose, .prose.markdown'));
        // Keep only LEAF markdown prose (no nested markdown prose inside)
        const parts = allParts.filter(p => !p.querySelector('.markdown.prose, .prose.markdown'));

        // Determine primary leaf for this container: prefer one that contains an <h1>.
        let primaryLeaf = null;
        for (const p of parts) {
          if (p.querySelector('h1')) { primaryLeaf = p; break; }
        }
        if (!primaryLeaf && parts.length) {
          // Fallback: leaf with the highest heading level present; else first leaf
          let best = null, bestLevel = 99;
          for (const p of parts) {
            const h = p.querySelector('h1,h2,h3,h4,h5,h6');
            if (h) {
              const lvl = parseInt(h.tagName.substring(1), 10) || 99;
              if (lvl < bestLevel) { bestLevel = lvl; best = p; }
            }
          }
          primaryLeaf = best || parts[0];
        }

        if (parts.length === 0) {
          // Fallback: whole container as one section (text only)
          const meta = inferSectionTitleMeta(container, sections.length, true);
          sections.push({ elem: container, title: meta.title, titleSource: meta.source, preview: createPreview(container), fallback: true, messageId, isPrimary: false });
        } else {
          for (const p of parts) {
            if (seen.has(p)) continue;
            seen.add(p);
            const meta = inferSectionTitleMeta(p, sections.length, false);
            sections.push({ elem: p, title: meta.title, titleSource: meta.source, preview: createPreview(p), fallback: false, messageId, isPrimary: (p === primaryLeaf) });
          }
        }
      }
    }
    return sections;
  }

  function inferSectionTitleMeta(elem, idx, isFallbackContainer) {
    // Prefer H1 when present (exactly h1)
    const h1 = elem.querySelector('h1');
    if (h1 && h1.textContent && h1.textContent.trim()) {
      return { title: h1.textContent.trim(), source: 'h1' };
    }
    // Otherwise, first <p>
    const p = elem.querySelector('p');
    if (p && p.textContent && p.textContent.trim()) {
      return { title: p.textContent.trim().replace(/\s+/g, ' ').slice(0, 80), source: 'p' };
    }
    // Fallback: brief snippet
    const text = (elem.textContent || '').trim().replace(/\s+/g, ' ');
    return { title: (text.slice(0, 80) || `Section ${idx + 1}`), source: 'snippet' };
  }

  function createPreview(elem) {
    const text = (elem.textContent || '').trim().replace(/\s+/g, ' ');
    return text.slice(0, 140);
  }

  function elementToMarkdown(elem) {
    const root = sanitizeClone(elem);

    function isElement(node, tag) {
      return node && node.nodeType === 1 && node.tagName === tag;
    }

    function getText(node) {
      return (node.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function escapeBackticks(text) {
      return text.replace(/`/g, '\\`');
    }

    function inline(node, opts = {}) {
      if (!node) return '';
      if (node.nodeType === Node.TEXT_NODE) {
        let t = node.nodeValue.replace(/\s+/g, ' ');
        if (opts.inTableCell) t = t.replace(/\|/g, '\\|').replace(/\n/g, ' ');
        return t;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName;
      switch (tag) {
        case 'BR':
          return opts.inTableCell ? ' ' : '\n';
        case 'CODE': {
          const content = Array.from(node.childNodes).map(n => inline(n, opts)).join('');
          return '`' + escapeBackticks(content.trim()) + '`';
        }
        case 'STRONG':
        case 'B':
          return '**' + Array.from(node.childNodes).map(n => inline(n, opts)).join('') + '**';
        case 'EM':
        case 'I':
          return '*' + Array.from(node.childNodes).map(n => inline(n, opts)).join('') + '*';
        case 'A': {
          const text = Array.from(node.childNodes).map(n => inline(n, opts)).join('') || getText(node);
          const href = node.getAttribute('href') || '';
          if (!href) return text;
          return `[${text}](${href})`;
        }
        case 'IMG': {
          const alt = node.getAttribute('alt') || '';
          const src = node.getAttribute('src') || '';
          return src ? `![${alt}](${src})` : '';
        }
        default:
          return Array.from(node.childNodes).map(n => inline(n, opts)).join('');
      }
    }

    function renderList(node, depth, ordered) {
      const items = Array.from(node.children).filter(ch => ch.tagName === 'LI');
      const lines = [];
      items.forEach((li, idx) => {
        const marker = ordered ? `${idx + 1}. ` : '- ';
        const indent = '  '.repeat(depth);
        // Split first line from the rest to keep nested blocks indented
        const content = block(li, depth + 1).trimEnd();
        const contentLines = content.split(/\n/);
        if (contentLines.length === 0) {
          lines.push(indent + marker);
        } else {
          lines.push(indent + marker + contentLines[0]);
          for (let i = 1; i < contentLines.length; i++) {
            const ln = contentLines[i];
            // Avoid leading spaces before table pipes inside list items
            if (ln.trimStart().startsWith('|')) {
              lines.push(indent + ln.trimStart());
            } else {
              lines.push(indent + '  ' + ln);
            }
          }
        }
      });
      return lines.join('\n') + '\n';
    }

    function tableToMarkdown(table) {
      const rows = Array.from(table.querySelectorAll('tr')).map(tr => {
        return Array.from(tr.children)
          .filter(td => td.tagName === 'TH' || td.tagName === 'TD')
          .map(td => inline(td, { inTableCell: true }).trim() || getText(td));
      }).filter(r => r.length);
      if (!rows.length) return '';
      let header = rows[0];
      const hasTh = !!table.querySelector('th');
      let body = rows.slice(hasTh ? 1 : 1);
      if (!hasTh) {
        // Treat first row as header anyway
        body = rows.slice(1);
      }
      const colCount = header.length;
      const divider = Array(colCount).fill('---');
      const lines = [];
      lines.push('| ' + header.join(' | ') + ' |');
      lines.push('| ' + divider.join(' | ') + ' |');
      body.forEach(r => {
        const cells = r.length < colCount ? r.concat(Array(colCount - r.length).fill('')) : r.slice(0, colCount);
        lines.push('| ' + cells.join(' | ') + ' |');
      });
      return lines.join('\n') + '\n\n';
    }

    function block(node, depth = 0) {
      if (!node) return '';
      if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue.replace(/\s+/g, ' ');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }
      const tag = node.tagName;
      switch (tag) {
        case 'H1':
        case 'H2':
        case 'H3':
        case 'H4':
        case 'H5':
        case 'H6': {
          const level = parseInt(tag.substring(1), 10);
          return '#'.repeat(Math.min(6, level)) + ' ' + inline(node) + '\n\n';
        }
        case 'P':
          return inline(node).trimEnd() + '\n\n';
        case 'BR':
          return '\n';
        case 'UL':
          return renderList(node, depth, false) + '\n';
        case 'OL':
          return renderList(node, depth, true) + '\n';
        case 'BLOCKQUOTE': {
          const content = Array.from(node.childNodes).map(n => block(n, depth)).join('');
          const prefixed = content.split(/\n/).map(line => (line.length ? '> ' + line : '>')).join('\n');
          return prefixed + '\n\n';
        }
        case 'HR':
          return '---\n\n';
        case 'TABLE':
          return tableToMarkdown(node);
        case 'PRE': {
          // If sanitizeClone already converted to fenced code text, just return its text.
          const code = node.querySelector('code');
          const langMatch = code && /language-([\w+-]+)/.exec(code.className || '');
          const lang = langMatch ? langMatch[1] : '';
          const codeText = code ? code.innerText : node.innerText;
          return `\n\n\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`;
        }
        default: {
          // Generic container
          return Array.from(node.childNodes).map(n => block(n, depth)).join('');
        }
      }
    }

    let md = block(root).replace(/\n{3,}/g, '\n\n');
    md = md.trimEnd();
    if (!md.endsWith('\n')) md += '\n';
    return md;
  }

  function sanitizePathSegment(name) {
    return (name || '')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .toLowerCase()
      || 'untitled';
  }

  async function downloadMarkdownSections(selectedIdxs, sections) {
    const folder = sanitizePathSegment(document.title || 'chatgpt-conversation');
    // Download sequentially so that if saveAs is needed, subsequent downloads inherit the chosen folder
    let asked = false;
    let successCount = 0;
    for (const idx of selectedIdxs) {
      const sec = sections[idx];
      if (!sec) continue;
      const title = sanitizePathSegment(sec.title).slice(0, 60) || `section-${idx+1}`;
      const md = elementToMarkdown(sec.elem);
      const filename = `${folder}/${title || ('section-' + (idx+1))}.md`;
      const ok = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'OAI_DOWNLOAD_MD', filename, content: md, saveAs: false }, (resp) => {
          resolve(Boolean(resp && resp.ok));
        });
      });
      if (!ok) {
        // Retry once with save dialog to let user pick folder
        const ok2 = await new Promise(resolve => {
          chrome.runtime.sendMessage({ type: 'OAI_DOWNLOAD_MD', filename, content: md, saveAs: true }, (resp) => {
            resolve(Boolean(resp && resp.ok));
          });
        });
        asked = true;
        if (!ok2) {
          console.warn('Download failed for', filename);
        } else {
          successCount++;
        }
      } else {
        successCount++;
      }
    }
    return successCount;
  }

  function buildDocsPanel(modal) {
    const sections = collectMarkdownSections();
    modal.innerHTML = '';
    const header = document.createElement('h3');
    header.textContent = 'Super Tool — Docs';
    modal.appendChild(header);

    const body = document.createElement('div');
    body.className = 'oai-modal-body';
    modal.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'oai-actions';
    const left = document.createElement('div');
    actions.appendChild(left);

    const right = document.createElement('div');
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'oai-pixel-btn secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeSuperModal);
    right.appendChild(cancelBtn);
    const dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.className = 'oai-pixel-btn primary';
    dlBtn.textContent = 'Download Selected';
    right.appendChild(dlBtn);
    const status = document.createElement('span');
    status.style.marginLeft = '8px';
    status.style.fontSize = '12px';
    status.style.color = 'var(--oai-stone)';
    right.appendChild(status);
    actions.appendChild(right);
    body.appendChild(actions);

    // Containers
    const generatedHeader = document.createElement('div');
    generatedHeader.style.display = 'flex';
    generatedHeader.style.alignItems = 'center';
    generatedHeader.style.justifyContent = 'space-between';
    generatedHeader.style.fontWeight = '700';
    generatedHeader.style.margin = '8px 0 4px';
    const genTitle = document.createElement('span');
    genTitle.textContent = 'Generated files';
    const genSelectWrap = document.createElement('label');
    const cbGenAll = document.createElement('input');
    cbGenAll.type = 'checkbox';
    genSelectWrap.appendChild(cbGenAll);
    genSelectWrap.appendChild(document.createTextNode(' Select All'));
    generatedHeader.appendChild(genTitle);
    generatedHeader.appendChild(genSelectWrap);
    const generatedList = document.createElement('div');
    generatedList.className = 'oai-docs-list';

    const messagesHeader = document.createElement('div');
    messagesHeader.style.display = 'flex';
    messagesHeader.style.alignItems = 'center';
    messagesHeader.style.justifyContent = 'space-between';
    messagesHeader.style.fontWeight = '700';
    messagesHeader.style.margin = '12px 0 4px';
    const msgTitle = document.createElement('span');
    msgTitle.textContent = 'Messages';
    const msgSelectWrap = document.createElement('label');
    const cbMsgAll = document.createElement('input');
    cbMsgAll.type = 'checkbox';
    msgSelectWrap.appendChild(cbMsgAll);
    msgSelectWrap.appendChild(document.createTextNode(' Select All'));
    messagesHeader.appendChild(msgTitle);
    messagesHeader.appendChild(msgSelectWrap);
    const messagesList = document.createElement('div');
    messagesList.className = 'oai-docs-list';

    body.appendChild(generatedHeader);
    body.appendChild(generatedList);
    body.appendChild(messagesHeader);
    body.appendChild(messagesList);

    // Default selection: only generated files (sections with h1)
    const selected = new Set();
    const boxMap = new Map(); // idx -> [inputs]
    const genIndices = [];
    const msgIndices = [];

    function bindCheckbox(cb, i) {
      if (!boxMap.has(i)) boxMap.set(i, []);
      boxMap.get(i).push(cb);
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(i); else selected.delete(i);
        // Mirror state to duplicates
        boxMap.get(i).forEach(other => { if (other !== cb) other.checked = cb.checked; });
        // Refresh section-level select-all states
        if (typeof updateSectionToggleStates === 'function') {
          updateSectionToggleStates();
        }
      });
    }

    function renderItem(sec, i, targetList) {
      const row = document.createElement('div');
      row.className = 'oai-doc-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selected.has(i);
      bindCheckbox(cb, i);
      row.appendChild(cb);
      const cell = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'oai-doc-title';
      title.textContent = sec.title;
      const preview = document.createElement('div');
      preview.className = 'oai-doc-preview';
      preview.textContent = sec.preview;
      cell.appendChild(title);
      cell.appendChild(preview);
      row.appendChild(cell);
      targetList.appendChild(row);
    }

    // Categorize and render
    sections.forEach((sec, i) => {
      const hasH1 = sec.titleSource === 'h1' || !!sec.elem.querySelector('h1');
      if (hasH1) {
        renderItem(sec, i, generatedList);
        selected.add(i);
        genIndices.push(i);
      } else {
        renderItem(sec, i, messagesList);
        msgIndices.push(i);
      }
    });

    // Initialize checkbox states based on default selection
    boxMap.forEach((boxes, i) => {
      const checked = selected.has(i);
      boxes.forEach(b => { b.checked = checked; });
    });

    function updateSectionToggleStates() {
      const genSel = genIndices.filter(i => selected.has(i)).length;
      const msgSel = msgIndices.filter(i => selected.has(i)).length;
      // Generated
      if (genIndices.length === 0) {
        cbGenAll.checked = false; cbGenAll.indeterminate = false; cbGenAll.disabled = true;
      } else if (genSel === 0) {
        cbGenAll.checked = false; cbGenAll.indeterminate = false; cbGenAll.disabled = false;
      } else if (genSel === genIndices.length) {
        cbGenAll.checked = true; cbGenAll.indeterminate = false; cbGenAll.disabled = false;
      } else {
        cbGenAll.checked = false; cbGenAll.indeterminate = true; cbGenAll.disabled = false;
      }
      // Messages
      if (msgIndices.length === 0) {
        cbMsgAll.checked = false; cbMsgAll.indeterminate = false; cbMsgAll.disabled = true;
      } else if (msgSel === 0) {
        cbMsgAll.checked = false; cbMsgAll.indeterminate = false; cbMsgAll.disabled = false;
      } else if (msgSel === msgIndices.length) {
        cbMsgAll.checked = true; cbMsgAll.indeterminate = false; cbMsgAll.disabled = false;
      } else {
        cbMsgAll.checked = false; cbMsgAll.indeterminate = true; cbMsgAll.disabled = false;
      }
    }

    updateSectionToggleStates();

    cbGenAll.addEventListener('change', () => {
      genIndices.forEach(i => {
        if (cbGenAll.checked) selected.add(i); else selected.delete(i);
        const boxes = boxMap.get(i) || [];
        boxes.forEach(b => { b.checked = cbGenAll.checked; });
      });
      updateSectionToggleStates();
    });
    cbMsgAll.addEventListener('change', () => {
      msgIndices.forEach(i => {
        if (cbMsgAll.checked) selected.add(i); else selected.delete(i);
        const boxes = boxMap.get(i) || [];
        boxes.forEach(b => { b.checked = cbMsgAll.checked; });
      });
      updateSectionToggleStates();
    });

    dlBtn.addEventListener('click', async () => {
      const idxs = Array.from(selected.values());
      if (!idxs.length) return;
      dlBtn.disabled = true; cancelBtn.disabled = true;
      status.textContent = 'Downloading…';
      const okCount = await downloadMarkdownSections(idxs, sections);
      if (okCount > 0) {
        status.textContent = '';
        closeSuperModal();
      } else {
        status.textContent = 'Could not start downloads. Check browser settings and try again.';
        dlBtn.disabled = false; cancelBtn.disabled = false;
      }
    });
  }

  function openSuperModal() {
    ensureStyles();
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSuperModal(); });
      document.body.appendChild(overlay);
    }
    let modal = document.getElementById(SUPER_MODAL_ID);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = SUPER_MODAL_ID;
      document.body.appendChild(modal);
    }
    buildDocsPanel(modal);
    modal.style.display = 'flex';
    overlay.classList.add('open');
  }

  // Observe dynamic UI so the bar survives rerenders
  const mo = new MutationObserver(() => {
    if (!document.getElementById(BAR_ID)) {
      ensureBar();
    }
  });

  function tryInit() {
    ensureBar();
    // Observe the entire app root for changes
    const root = document.body;
    if (root) mo.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    tryInit();
  } else {
    window.addEventListener('DOMContentLoaded', tryInit, { once: true });
  }
})();
