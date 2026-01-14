/**
 * Background service worker for the Recordings Auto Generator Chrome extension.
 *
 * This script listens for clicks on the extension's action button. When clicked,
 * it injects a self‑contained function into the active tab. The injected
 * function iterates over each recording item in the Plaud web interface.
 * For each entry that has not already been generated, it:
 * 1. Clicks the "generate" icon
 * 2. Selects the "Custom generation" option
 * 3. Toggles the "Speaker labels" switch ON
 * 4. Clicks the "Generate Now" button
 *
 * Works on https://web.plaud.ai/
 */

// Listen for a click on the extension's toolbar icon.
chrome.action.onClicked.addListener((tab) => {
  // Inject the automation function into the current tab.
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: automateGeneration
  }).catch((error) => {
    console.error('Failed to inject script:', error);
  });
});

/**
 * Self‑contained function injected into the page.
 *
 * It searches for list items on the page and processes each one sequentially.
 * For each item that hasn't been generated yet, it:
 * 1. Clicks the generate icon
 * 2. Selects "Custom generation" option
 * 3. Toggles "Speaker labels" switch ON
 * 4. Clicks "Generate Now" button
 */
function automateGeneration() {
  /**
   * Helper to delay execution for a specified number of milliseconds.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Dispatches a click event on a DOM element.
   * @param {Element} element
   * @param {number} delay - Delay after clicking in ms
   */
  const clickElement = async (element, delay = 500) => {
    if (!element) return false;
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await sleep(delay);
    return true;
  };

  /**
   * Waits for an element matching the predicate to appear in the DOM.
   * Searches repeatedly until timeout expires.
   *
   * @param {function(): (Element|null)} finder Function that returns an element or null
   * @param {number} timeout Maximum time to wait in milliseconds
   * @returns {Promise<Element|null>}
   */
  const waitFor = async (finder, timeout = 8000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = finder();
      if (el) return el;
      await sleep(200);
    }
    return null;
  };

  /**
   * Waits for a dialog/modal to close.
   */
  const waitForDialogClose = async (timeout = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const dialog = document.querySelector('.el-dialog');
      if (!dialog) return true;
      await sleep(300);
    }
    return false;
  };

  /**
   * Processes a single recording entry.
   * @param {Element} item
   * @returns {Promise<boolean>} true if processed, false if skipped
   */
  const processItem = async (item) => {
    // Check if item has "Generated" status in metadata
    const metadata = item.querySelector('.file-list-item__metadata');
    if (metadata && metadata.textContent && metadata.textContent.toLowerCase().includes('generated')) {
      console.log('[AutoGen] Skipping already generated item');
      return false;
    }

    // Also skip if the generate icon is not visible/present
    const generateIconWrapper = item.querySelector('.generate-icon-wrapper');
    if (!generateIconWrapper) {
      console.log('[AutoGen] No generate icon found, skipping');
      return false;
    }

    // Find the clickable generate icon (span with class .generate-icon)
    const generateIcon = generateIconWrapper.querySelector('.generate-icon');
    if (!generateIcon) {
      console.log('[AutoGen] Generate icon span not found, skipping');
      return false;
    }

    console.log('[AutoGen] Clicking generate icon...');
    await clickElement(generateIcon, 800);

    // Wait for the generation dialog to appear and select "Custom generation"
    const customOption = await waitFor(() => {
      const options = document.querySelectorAll('.generation-option');
      for (const option of options) {
        if (option.textContent && option.textContent.includes('Custom generation')) {
          return option;
        }
      }
      return null;
    }, 8000);

    if (!customOption) {
      console.log('[AutoGen] Custom generation option not found');
      return false;
    }

    console.log('[AutoGen] Clicking Custom generation...');
    await clickElement(customOption, 800);

    // Wait for custom options to appear and find the Speaker labels toggle
    const speakerSwitch = await waitFor(() => {
      const configItems = document.querySelectorAll('.config-item');
      for (const configItem of configItems) {
        const label = configItem.querySelector('.config-name');
        if (label && label.textContent && label.textContent.includes('Speaker labels')) {
          // Find the el-switch within this config item
          const switchEl = configItem.querySelector('.el-switch');
          if (switchEl) return switchEl;
        }
      }
      return null;
    }, 8000);

    if (speakerSwitch) {
      // Check if switch is already checked
      const input = speakerSwitch.querySelector('input[type="checkbox"]');
      const isChecked = input && input.checked;
      if (!isChecked) {
        console.log('[AutoGen] Toggling Speaker labels ON...');
        await clickElement(speakerSwitch, 500);
      } else {
        console.log('[AutoGen] Speaker labels already ON');
      }
    } else {
      console.log('[AutoGen] Speaker labels switch not found');
    }

    // Click the "Generate Now" button
    const generateNowButton = await waitFor(() => {
      return document.querySelector('.generate-button');
    }, 5000);

    if (!generateNowButton) {
      console.log('[AutoGen] Generate Now button not found');
      return false;
    }

    console.log('[AutoGen] Clicking Generate Now...');
    await clickElement(generateNowButton, 1000);

    // Wait for dialog to close before processing next item
    console.log('[AutoGen] Waiting for dialog to close...');
    await waitForDialogClose(10000);
    await sleep(1000); // Extra delay for UI to settle

    return true;
  };

  /**
   * Main routine: iterate over recording list items sequentially.
   */
  const run = async () => {
    // Select all file list items
    const items = Array.from(document.querySelectorAll('.file-list-item'));
    console.log(`[AutoGen] Found ${items.length} recording items`);

    let processed = 0;
    let skipped = 0;

    for (let i = 0; i < items.length; i++) {
      console.log(`[AutoGen] Processing item ${i + 1}/${items.length}`);
      const result = await processItem(items[i]);
      if (result) {
        processed++;
      } else {
        skipped++;
      }
    }

    console.log(`[AutoGen] Complete! Processed: ${processed}, Skipped: ${skipped}`);
  };

  // Start the automation.
  run().catch((err) => console.error('[AutoGen] Error:', err));
}