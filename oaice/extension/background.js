// Background service worker for downloads
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'OAI_DOWNLOAD_MD') {
    try {
      const { filename, content, saveAs } = message;
      // Use data: URL for MV3 service worker compatibility
      const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(content || '');
      chrome.downloads.download({
        url: dataUrl,
        filename, // may include subfolder; relative to default downloads dir
        saveAs: Boolean(saveAs),
        conflictAction: 'uniquify'
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message || 'download error' });
        } else {
          sendResponse({ ok: true, id: downloadId });
        }
      });
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true; // async
  }
});
