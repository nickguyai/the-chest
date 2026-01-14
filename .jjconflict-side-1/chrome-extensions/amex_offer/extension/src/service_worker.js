// Amex Offers Helper - background service worker

const toCSV = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const headers = [
    'id',
    'title',
    'description',
    'expires',
    'imageSrc',
    'clickedAt'
  ];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h])).join(','));
  }
  return lines.join('\n');
};

const sanitizeOffers = (offers) =>
  (Array.isArray(offers) ? offers : []).map((o) => {
    const { pageUrl, ...rest } = o || {};
    return rest;
  });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'download_offers') {
      try {
        const { offers, format = 'json', filename } = msg;
        const finalName = filename || (format === 'csv' ? 'amex_offers.csv' : 'amex_offers.json');
        // Use data URL instead of Blob/Object URL (not available in MV3 SW)
        let dataUrl;
        if (format === 'csv') {
          const csv = toCSV(sanitizeOffers(offers));
          dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        } else {
          const json = JSON.stringify(sanitizeOffers(offers), null, 2);
          dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
        }
        await chrome.downloads.download({ url: dataUrl, filename: finalName, saveAs: true });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return;
    }
    sendResponse({ ok: false, error: 'unknown_message' });
  })();
  return true;
});
