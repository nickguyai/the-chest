const qs = (sel) => document.querySelector(sel);

async function sendToActiveTab(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('no_active_tab');
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function getOffersFallback() {
  const KEY = 'amex_offers_collected';
  const res = await chrome.storage.local.get([KEY]);
  return Array.isArray(res[KEY]) ? res[KEY] : [];
}

async function refreshCounts() {
  let result = await sendToActiveTab({ type: 'get_counts' });
  if (!result?.ok) {
    const offers = await getOffersFallback();
    qs('#savedCount').textContent = String(offers.length);
    return;
  }
  qs('#savedCount').textContent = String(result.result.totalSaved);
}

async function collectOffers() {
  const delayMs = Number(qs('#delay').value || 300);
  qs('#status').textContent = 'Scanning and clicking...';
  const res = await sendToActiveTab({ type: 'collect_offers', delayMs });
  if (res?.ok) {
    const r = res.result;
    qs('#status').textContent = `Found ${r.found}, clicked ${r.clicked}, newly saved ${r.saved}. Total saved ${r.totalSaved}.`;
  } else {
    qs('#status').textContent = `Failed to collect: ${res?.error || 'unknown error'}`;
  }
  await refreshCounts();
}

async function exportOffers(format) {
  qs('#status').textContent = 'Preparing export...';
  let res = await sendToActiveTab({ type: 'get_offers' });
  let offers;
  if (res?.ok) {
    offers = res.offers;
  } else {
    offers = await getOffersFallback();
  }
  const filename = format === 'csv' ? 'amex_offers.csv' : 'amex_offers.json';
  const dlRes = await chrome.runtime.sendMessage({
    type: 'download_offers',
    offers,
    format,
    filename
  });
  if (dlRes?.ok) {
    qs('#status').textContent = `Exported ${offers.length} offers as ${format.toUpperCase()}.`;
  } else {
    qs('#status').textContent = `Export failed: ${dlRes?.error || 'unknown error'}`;
  }
}

async function clearSaved() {
  let res = await sendToActiveTab({ type: 'clear_offers' });
  if (!res?.ok) {
    // fallback: clear storage directly
    await chrome.storage.local.set({ amex_offers_collected: [] });
  }
  qs('#status').textContent = 'Cleared saved offers.';
  await refreshCounts();
}

document.addEventListener('DOMContentLoaded', () => {
  qs('#scan').addEventListener('click', collectOffers);
  qs('#exportJson').addEventListener('click', () => exportOffers('json'));
  qs('#exportCsv').addEventListener('click', () => exportOffers('csv'));
  qs('#clear').addEventListener('click', clearSaved);
  refreshCounts();
});

