/**
 * Kaizen OS - GCal to Notion Sync
 * Main Application Logic
 */

/**
 * Serves the landing page (Zen UI) or handles OAuth callback
 * The OAuth callback is routed here (instead of /usercallback) to ensure
 * it runs as the developer, fixing the "state token invalid" error.
 */
function doGet(e) {
  // Handle OAuth2 callback (when Google redirects back with ?oauth=callback&code=...)
  if (
    e &&
    e.parameter &&
    (e.parameter.oauth === "callback" || e.parameter.code)
  ) {
    return handleOAuthCallback(e);
  }

  return HtmlService.createTemplateFromFile("index")
    .evaluate()
    .setTitle("Kaizen OS Sync")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/**
 * UI Helper: Get user identity
 * Used by index.html to start the auth flow
 */
function getUserIdentity() {
  try {
    const email = Session.getActiveUser().getEmail();
    return { success: true, email: email };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Check if user can access the backend sheet and get their email
 */
function checkAccess() {
  try {
    const email = Session.getActiveUser().getEmail();
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Check if we can read the sheet (implies access)
    if (!ss) throw new Error("Spreadsheet not found");

    // Optional: Check if 'users' sheet exists or can be created
    let sheet = ss.getSheetByName("users");
    if (!sheet) {
      // Try creating to verify edit permission
      sheet = ss.insertSheet("users");
      sheet.appendRow([
        "email",
        "notion_api_key",
        "database_id",
        "calendar_id",
      ]);
    }

    return { success: true, email: email };
  } catch (e) {
    return {
      success: false,
      error:
        "Access Denied: You do not have permission to edit the configuration sheet. Please contact the administrator.",
      details: e.message,
    };
  }
}

/**
 * Main Trigger Function - Run this hourly
 * When running as "User accessing the web app", this runs for THAT user.
 */
function syncCalendarToNotion() {
  const email = Session.getActiveUser().getEmail();
  Config.log(`[${email}] Starting sync job...`, "INFO");

  // Get config specfic to this user
  const userConfig = Config.getUserConfig(email);

  if (!userConfig) {
    Config.log(`[${email}] No configuration found. Skipping.`, "WARNING");
    return;
  }

  try {
    processUser(userConfig);
  } catch (e) {
    Config.log(`Error syncing for ${email}: ${e.message}\n${e.stack}`, "ERROR");
    throw e; // Re-throw to show in execution logs if manual
  }

  Config.log(`[${email}] Sync job finished.`, "INFO");
}

/**
 * Setup trigger for the active user
 */
function setupUserTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  const functionName = "syncCalendarToNotion";

  // Check if exists
  const exists = triggers.some((t) => t.getHandlerFunction() === functionName);

  if (!exists) {
    ScriptApp.newTrigger(functionName).timeBased().everyHours(1).create();
    return "Created new hourly trigger.";
  }
  return "Trigger already exists.";
}

/**
 * Process sync for a single user
 * Uses OAuth2 to access the user's calendar via REST API
 */
function processUser(user) {
  const notion = new NotionAPI(user.notion_api_key);
  const calId = user.calendar_id || "primary";
  const dbId = user.database_id;

  // Sync Window: Now to +7 days
  const now = new Date();
  const future = new Date();
  future.setDate(now.getDate() + 7);

  // Fetch GCal Events via OAuth2 REST API
  let events;
  try {
    events = fetchCalendarEventsOAuth(user.email, calId, now, future);
  } catch (e) {
    throw new Error(
      `Could not access calendar for ${user.email}: ${e.message}`
    );
  }

  if (!events || events.length === 0) {
    Config.log(`[${user.email}] No upcoming events found.`, "INFO");
    return;
  }

  // Process events
  let createdCount = 0;

  events.forEach((event) => {
    const eventId = event.id;
    const title = event.summary || "Untitled Event";

    // Check if exists
    if (!findExistingCard(notion, dbId, eventId)) {
      createNotionCardFromApi(notion, dbId, event);
      createdCount++;
    }
  });

  if (createdCount > 0) {
    Config.log(`[${user.email}] Synced ${createdCount} new events.`, "SUCCESS");
  }
}

/**
 * Check if card exists in Notion using gcal:{eventId} signature
 */
function findExistingCard(notion, dbId, eventId) {
  const signature = `gcal:${eventId}`;

  // Query Database filtering by Description
  // Note: 'Description' in ref.md maps to a text/rich_text property.
  // Verify your Notion DB property name. Code assumes "Description".

  try {
    const results = notion.queryDatabase(dbId, {
      filter: {
        property: "Description",
        rich_text: {
          contains: signature,
        },
      },
      page_size: 1,
    });

    return results.results.length > 0;
  } catch (e) {
    // If property doesn't exist or other error, throw to log
    throw new Error(`Failed to query database: ${e.message}`);
  }
}

/**
 * Create the card in Notion from a Calendar API event object
 * @param {NotionAPI} notion - The Notion API client.
 * @param {string} dbId - The Notion database ID.
 * @param {Object} event - The Calendar API event object (REST format).
 */
function createNotionCardFromApi(notion, dbId, event) {
  // Calendar API returns dates in different formats
  // All-day events have event.start.date (YYYY-MM-DD)
  // Timed events have event.start.dateTime (ISO string)
  const isAllDay = !!event.start.date;
  const startStr = event.start.dateTime || event.start.date;
  const endStr = event.end ? event.end.dateTime || event.end.date : null;

  const dateObj = { start: startStr };
  if (endStr && !isAllDay) {
    dateObj.end = endStr;
  }

  const payload = {
    parent: { database_id: dbId },
    properties: {
      Title: {
        title: [{ text: { content: event.summary || "Untitled Event" } }],
      },
      "Unit Type": {
        select: { name: "TASK" },
      },
      Status: {
        status: { name: "Not Started" },
      },
      "Target Date": {
        date: dateObj,
      },
      // Deduplication ID + Original Description
      Description: {
        rich_text: [
          {
            text: {
              content: `gcal:${event.id}\n\n${event.description || ""}`,
            },
          },
        ],
      },
    },
  };

  notion.createPage(payload);
}
