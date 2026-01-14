// Amex Offers Helper - content script
(() => {
  if (window.__amexOffersHelperLoaded) return;
  window.__amexOffersHelperLoaded = true;

  const STATE = {
    key: 'amex_offers_collected'
  };

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return (
      style &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    );
  };

  const stableId = (title, desc) => {
    const str = `${title || ''}|${desc || ''}`.toLowerCase();
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return 'h' + (h >>> 0).toString(36);
  };

  const getStoredOffers = async () => {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STATE.key], (res) => {
          resolve(Array.isArray(res[STATE.key]) ? res[STATE.key] : []);
        });
      } catch (e) {
        resolve([]);
      }
    });
  };

  const setStoredOffers = async (offers) => {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [STATE.key]: offers }, () => resolve());
      } catch (e) {
        resolve();
      }
    });
  };

  const addOfferToStorage = async (offer) => {
    const current = await getStoredOffers();
    const exists = current.some((o) => o.id === offer.id);
    if (!exists) {
      current.push(offer);
      await setStoredOffers(current);
      return true;
    }
    return false;
  };

  const findOfferButtons = () => {
    const btns = Array.from(
      document.querySelectorAll('button[data-testid="merchantOfferListAddButton"]')
    );
    return btns.filter((b) => !b.dataset.amexProcessed && isVisible(b));
  };

  const autoScrollLoadAllOffers = async (options = {}) => {
    const {
      stepPx = 1200,
      delayMs = 400,
      maxSteps = 150,
      stableIterations = 3
    } = options;

    let lastTotal = 0;
    let stable = 0;
    for (let i = 0; i < maxSteps; i++) {
      const totalBtns = document.querySelectorAll('button[data-testid="merchantOfferListAddButton"]').length;
      if (totalBtns <= lastTotal) {
        stable += 1;
      } else {
        stable = 0;
        lastTotal = totalBtns;
      }

      const atBottom = Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight;
      if (atBottom && stable >= stableIterations) break;

      window.scrollBy({ top: stepPx, left: 0, behavior: 'smooth' });
      await sleep(delayMs);
    }
  };

  const getOfferContainer = (btn) => {
    // Traverse up until we find a container that contains a title (h3) and the button
    let node = btn;
    while (node && node !== document.body) {
      const hasTitle = node.querySelector && node.querySelector('h3, h3 span');
      const hasBtn = node.querySelector && node.querySelector('button[data-testid="merchantOfferListAddButton"]');
      if (hasTitle && hasBtn) return node;
      node = node.parentElement;
    }
    return btn.closest('div') || btn;
  };

  const textOrNull = (el) => (el ? el.textContent.trim() : null);

  const extractOffer = (container) => {
    // Title
    let title = null;
    const titleEl = container.querySelector('h3 span, h3');
    title = textOrNull(titleEl);

    // Description (prefer a direct span inside overflowText container that is not inside h3)
    let description = null;
    const descCandidate = Array.from(
      container.querySelectorAll('div[data-testid="overflowTextContainer"] > span')
    )[0];
    description = textOrNull(descCandidate);

    // Fallback for description: find second overflowTextContainer
    if (!description) {
      const allOverflow = Array.from(
        container.querySelectorAll('div[data-testid="overflowTextContainer"]')
      );
      const second = allOverflow.find((el) => el !== titleEl?.parentElement);
      description = textOrNull(second?.querySelector('span')) || null;
    }

    // Expiry
    let expires = null;
    const pWithExpires = Array.from(container.querySelectorAll('p')).find((p) =>
      /expires/i.test(p.textContent || '')
    );
    expires = textOrNull(pWithExpires);

    // Image
    const imgEl = container.querySelector('img');
    const imageSrc = imgEl ? imgEl.getAttribute('src') : null;

    const id = stableId(title || '', description || '');
    // Do not store pageUrl to avoid leaking account information
    return { id, title, description, expires, imageSrc };
  };

  const clickAllSequentially = async (delayMs = 300) => {
    // Auto-scroll first to load all lazy offers
    await autoScrollLoadAllOffers({ delayMs: Math.max(300, delayMs) });
    const buttons = findOfferButtons();
    let clicked = 0;
    let saved = 0;
    for (const btn of buttons) {
      const container = getOfferContainer(btn);
      const offer = extractOffer(container);
      // Scroll into view and click
      try {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {}
      await sleep(50);
      try {
        btn.click();
        clicked += 1;
      } catch {}
      offer.clickedAt = new Date().toISOString();
      const added = await addOfferToStorage(offer);
      if (added) saved += 1;
      btn.dataset.amexProcessed = '1';
      await sleep(delayMs);
    }
    const offers = await getStoredOffers();
    return { found: buttons.length, clicked, saved, totalSaved: offers.length };
  };

  const getCounts = async () => {
    const offers = await getStoredOffers();
    return { totalSaved: offers.length };
  };

  const getOffers = async () => await getStoredOffers();

  const clearOffers = async () => {
    await setStoredOffers([]);
    return { totalSaved: 0 };
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      try {
        if (msg?.type === 'collect_offers') {
          const delay = Number(msg?.delayMs ?? 300);
          const result = await clickAllSequentially(delay);
          sendResponse({ ok: true, result });
          return;
        }
        if (msg?.type === 'get_offers') {
          const offers = await getOffers();
          sendResponse({ ok: true, offers });
          return;
        }
        if (msg?.type === 'clear_offers') {
          const result = await clearOffers();
          sendResponse({ ok: true, result });
          return;
        }
        if (msg?.type === 'get_counts') {
          const result = await getCounts();
          sendResponse({ ok: true, result });
          return;
        }
        // Ignore unrelated messages
        sendResponse({ ok: false, error: 'unknown_message' });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // keep the message channel open for async response
  });

  // Passive: do nothing automatically unless asked via popup
})();
