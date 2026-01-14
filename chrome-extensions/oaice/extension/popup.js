function getActiveTabId() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      if (!tabs || !tabs.length) return reject(new Error('No active tab'));
      resolve(tabs[0].id);
    });
  });
}

async function extract() {
  const status = document.getElementById('status');
  status.textContent = 'Extracting…';
  const tabId = await getActiveTabId();
  const roles = getSelectedRoles();
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONVERSATION', roles }, resp => {
      if (!resp) {
        status.textContent = 'No response. Are you on a ChatGPT tab?';
        resolve(null);
        return;
      }
      if (!resp.ok) {
        status.textContent = 'Error: ' + resp.error;
        resolve(null);
        return;
      }
      resolve(resp.data);
    });
  });
}

function enableActions(enabled) {
  ['copyJson', 'downloadJson', 'copyText'].forEach(id => {
    document.getElementById(id).disabled = !enabled;
  });
}

function asTextList(messages) {
  return messages
    .map(m => `${m.role.toUpperCase()}:\n${m.text}`)
    .join('\n\n---\n\n');
}

function getSelectedRoles() {
  const selected = document.querySelector('input[name="roleFilter"]:checked');
  const val = selected ? selected.value : 'all';
  if (val === 'user') return ['user'];
  if (val === 'assistant') return ['assistant'];
  return null; // null means all
}

document.getElementById('extract').addEventListener('click', async () => {
  enableActions(false);
  const data = await extract();
  if (!data) return;
  const output = document.getElementById('output');
  output.value = JSON.stringify(data, null, 2);
  const filter = data.rolesFilter && data.rolesFilter.length ? data.rolesFilter.join(', ') : 'all';
  document.getElementById('status').textContent = `${data.count} messages found (${filter})`;
  enableActions(true);
});

document.getElementById('copyJson').addEventListener('click', () => {
  const output = document.getElementById('output').value;
  navigator.clipboard.writeText(output);
});

document.getElementById('downloadJson').addEventListener('click', () => {
  const data = document.getElementById('output').value;
  if (!data) return;
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chatgpt-conversation.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById('copyText').addEventListener('click', () => {
  try {
    const parsed = JSON.parse(document.getElementById('output').value);
    const text = asTextList(parsed.messages || []);
    navigator.clipboard.writeText(text);
  } catch (_) {}
});
