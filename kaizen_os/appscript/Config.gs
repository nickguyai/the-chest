/**
 * Configuration Management
 */
const Config = {
  // Spreadsheet Structure Helpers

  /**
   * Get users from the 'users' sheet
   * Expected headers: email | notion_api_key | database_id | calendar_id
   * @returns {Array<{email, key, db, cal}>}
   */
  getUsers: function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      // Allow running loosely if not bound, but throw for now as we need config
      throw new Error(
        "Script must be bound to a Google Sheet with a 'users' tab."
      );
    }

    let sheet = ss.getSheetByName("users");

    // Auto-create if missing (UX improvement)
    if (!sheet) {
      sheet = ss.insertSheet("users");
      sheet.appendRow([
        "email",
        "notion_api_key",
        "database_id",
        "calendar_id",
        "refresh_token",
      ]);
      return [];
    }

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return []; // Only headers

    return data
      .map((row) => ({
        email: row[0],
        notion_api_key: row[1],
        database_id: row[2],
        calendar_id: row[3] || row[0], // Default to email if cal_id is empty
      }))
      .filter((u) => u.email && u.notion_api_key);
  },

  /**
   * Get config for a specific user
   */
  getUserConfig: function (email) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("users");
    if (!sheet) return null;

    const data = sheet.getDataRange().getValues();
    // Skip header
    for (let i = 1; i < data.length; i++) {
      // [email, notion_key, db_id, cal_id, refresh_token]
      if (data[i][0] === email) {
        return {
          email: data[i][0],
          notion_api_key: data[i][1],
          database_id: data[i][2],
          calendar_id: data[i][3] || "primary",
          refresh_token: data[i][4] || null,
        };
      }
    }
    return null;
  },

  /**
   * Log status to 'logs' sheet
   */
  log: function (message, type = "INFO") {
    // ... logging implementation ...
    // Note: If running as user, they need edit access to sheet for this to work
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) {
        console.log(`[${type}] ${message}`);
        return;
      }

      let sheet = ss.getSheetByName("logs");
      if (!sheet) {
        // Might fail if user doesn't have permission to create sheet
        try {
          sheet = ss.insertSheet("logs");
          sheet.appendRow(["Timestamp", "Type", "Message"]);
        } catch (e) {}
      }

      if (sheet) sheet.appendRow([new Date(), type, message]);
    } catch (e) {
      console.log(`Log Error: ${e.message} -- Original: [${type}] ${message}`);
    }
  },

  /**
   * Save user configuration from Web App
   * @param {Object} config - {email, notion_api_key, database_id, calendar_id}
   */
  saveUserConfig: function (config) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("users");

    if (!sheet) {
      sheet = ss.insertSheet("users");
      sheet.appendRow([
        "email",
        "notion_api_key",
        "database_id",
        "calendar_id",
      ]);
    }

    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    // Force email to be the active user email
    // (security: prevent saving config for others)
    const activeEmail = Session.getActiveUser().getEmail();
    if (activeEmail && config.email !== activeEmail) {
      // Only enforce if we can actually detect it
      // throw new Error(`Email mismatch. You are logged in as ${activeEmail}`);
    }

    // Find existing user by email (skip header)
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == config.email) {
        rowIndex = i + 1; // 1-indexed
        break;
      }
    }

    // Critical: Setup Trigger & Run Immediate Sync
    let triggerMsg = "";
    try {
      triggerMsg = setupUserTrigger(); // Defined in main.gs
    } catch (e) {
      triggerMsg = "Trigger setup failed: " + e.message;
    }

    if (rowIndex > 0) {
      // Update existing
      sheet.getRange(rowIndex, 2).setValue(config.notion_api_key);
      sheet.getRange(rowIndex, 3).setValue(config.database_id);
      sheet.getRange(rowIndex, 4).setValue(config.calendar_id);
    } else {
      // Append new
      sheet.appendRow([
        config.email,
        config.notion_api_key,
        config.database_id,
        config.calendar_id,
      ]);
    }

    // Run Immediate Sync
    try {
      syncCalendarToNotion(); // Defined in main.gs
    } catch (e) {
      return {
        success: true,
        message: `Saved & Triggered! But sync failed: ${e.message}`,
      };
    }

    return {
      success: true,
      message: `Saved! ${triggerMsg} First sync completed.`,
    };
  },
};

/**
 * Expose for client-side
 */
function saveConfig(formObject) {
  // Enforce email from session if possible
  const email = Session.getActiveUser().getEmail();

  return Config.saveUserConfig({
    email: email || formObject.email, // Fallback if Session is empty (testing)
    notion_api_key: formObject.notion_api_key,
    database_id: formObject.database_id,
    calendar_id: formObject.calendar_id,
  });
}

/**
 * Get current user email for UI
 */
function getActiveEmail() {
  return Session.getActiveUser().getEmail();
}
