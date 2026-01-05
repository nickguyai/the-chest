/**
 * OAuth2 Service Configuration
 * Uses the google-apps-script-oauth2 library.
 *
 * SETUP REQUIRED:
 * 1. Create OAuth 2.0 credentials in GCP Console (Web Application type).
 * 2. Set Authorized Redirect URI to: https://script.google.com/macros/d/{SCRIPT_ID}/usercallback
 * 3. Enable Google Calendar API in your GCP project.
 * 4. Store CLIENT_ID and CLIENT_SECRET in Script Properties (File > Project Properties > Script Properties).
 */

// --- Configuration ---
// These MUST be set in Script Properties before deployment.
const OAUTH_CLIENT_ID =
  PropertiesService.getScriptProperties().getProperty("CLIENT_ID");
const OAUTH_CLIENT_SECRET =
  PropertiesService.getScriptProperties().getProperty("CLIENT_SECRET");

/**
 * Creates the OAuth2 service for a given user.
 * Uses the deployed web app URL as the redirect URI to ensure the callback
 * runs as the developer (fixing the "state token invalid" error).
 * @param {string} userEmail - The email of the user to create the service for.
 * @returns {OAuth2.Service} The OAuth2 service object.
 */
function getCalendarOAuthService(userEmail) {
  // Get the deployed web app URL for the redirect
  // This ensures the callback runs through doGet() as the developer
  const webAppUrl = ScriptApp.getService().getUrl();
  const redirectUri = webAppUrl + "?oauth=callback";

  return OAuth2.createService("gcal")
    .setAuthorizationBaseUrl("https://accounts.google.com/o/oauth2/v2/auth")
    .setTokenUrl("https://oauth2.googleapis.com/token")
    .setClientId(OAUTH_CLIENT_ID)
    .setClientSecret(OAUTH_CLIENT_SECRET)
    .setCallbackFunction("handleOAuthCallback")
    .setRedirectUri(redirectUri)
    .setPropertyStore(PropertiesService.getScriptProperties())
    .setCache(CacheService.getScriptCache())
    .setScope(
      "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email"
    )
    .setParam("access_type", "offline")
    .setParam("prompt", "consent")
    .setParam("login_hint", userEmail);
}

/**
 * Handles the OAuth2 callback from Google.
 * Called by doGet when the 'code' parameter is present.
 * @param {Object} request - The request object from doGet.
 * @returns {HtmlOutput} A success or failure message page.
 */
function handleOAuthCallback(request) {
  // Create service with a placeholder email (we'll get the real email after auth)
  const service = getCalendarOAuthService("pending");
  const isAuthorized = service.handleCallback(request);

  if (isAuthorized) {
    // Fetch the user's actual email using the access token
    try {
      const userEmail = fetchUserEmail(service.getAccessToken());

      // Get the token object and extract refresh_token
      const token = service.getToken();
      const refreshToken = token ? token.refresh_token : null;

      if (refreshToken && userEmail) {
        saveRefreshToken(userEmail, refreshToken);
      }

      // Store the email so the frontend knows who logged in
      const cache = CacheService.getScriptCache();
      cache.put("authenticated_email", userEmail, 600);

      // Redirect to the main app
      return HtmlService.createHtmlOutput(
        '<script>window.top.location.href = "' +
          ScriptApp.getService().getUrl() +
          '";</script>' +
          "<h2>Success! Authorization complete.</h2><p>Redirecting...</p>"
      );
    } catch (e) {
      return HtmlService.createHtmlOutput(
        "<h2>Authorization succeeded but failed to get user info.</h2>" +
          "<p>Error: " +
          e.message +
          "</p>"
      );
    }
  } else {
    return HtmlService.createHtmlOutput(
      "<h2>Authorization Failed.</h2><p>Please try again.</p>"
    );
  }
}

/**
 * Fetches the user's email from Google's userinfo API.
 * @param {string} accessToken - The OAuth2 access token.
 * @returns {string} The user's email address.
 */
function fetchUserEmail(accessToken) {
  const response = UrlFetchApp.fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: "Bearer " + accessToken },
      muteHttpExceptions: true,
    }
  );
  const data = JSON.parse(response.getContentText());
  if (data.error) {
    throw new Error(data.error.message || "Could not fetch user info");
  }
  return data.email;
}

/**
 * Saves the refresh token to the users sheet.
 * @param {string} email - User email.
 * @param {string} refreshToken - The OAuth2 refresh token.
 */
function saveRefreshToken(email, refreshToken) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("users");

  if (!sheet) {
    sheet = ss.insertSheet("users");
    sheet.appendRow([
      "email",
      "notion_api_key",
      "database_id",
      "calendar_id",
      "refresh_token",
    ]);
  }

  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;

  // Find existing user
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      rowIndex = i + 1; // 1-indexed for sheet
      break;
    }
  }

  if (rowIndex > 0) {
    // Update existing row - refresh_token is column 5 (E)
    sheet.getRange(rowIndex, 5).setValue(refreshToken);
  } else {
    // Create new row with just email and refresh token (user will fill rest via form)
    sheet.appendRow([email, "", "", "", refreshToken]);
  }
}

/**
 * Gets the authorization URL for a user.
 * Called from the frontend to initiate the OAuth flow.
 * @param {string} userEmail - The email hint for the user (optional, used for login_hint).
 * @returns {Object} { authUrl: string } or { error: string }
 */
function getAuthorizationUrl(userEmail) {
  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
    return {
      error:
        "OAuth not configured. Please set CLIENT_ID and CLIENT_SECRET in Script Properties.",
    };
  }

  const service = getCalendarOAuthService(userEmail || "");

  if (service.hasAccess()) {
    // Already authorized - get the email from cache if available
    const cache = CacheService.getScriptCache();
    const email = cache.get("authenticated_email") || userEmail || "";
    return { authorized: true, email: email };
  }

  return { authUrl: service.getAuthorizationUrl() };
}

/**
 * Checks if a user has authorized calendar access.
 * @param {string} userEmail - The user's email.
 * @returns {boolean} True if authorized.
 */
function hasCalendarAccess(userEmail) {
  const service = getCalendarOAuthService(userEmail);
  return service.hasAccess();
}

/**
 * Fetches calendar events using the stored OAuth token.
 * This replaces the CalendarApp approach.
 * @param {string} userEmail - The user's email (to get their OAuth token).
 * @param {string} calendarId - The calendar ID to fetch from.
 * @param {Date} timeMin - Start of the time window.
 * @param {Date} timeMax - End of the time window.
 * @returns {Array} Array of event objects.
 */
function fetchCalendarEventsOAuth(userEmail, calendarId, timeMin, timeMax) {
  const service = getCalendarOAuthService(userEmail);

  if (!service.hasAccess()) {
    throw new Error(
      "User has not authorized calendar access. Please re-authenticate."
    );
  }

  const url =
    "https://www.googleapis.com/calendar/v3/calendars/" +
    encodeURIComponent(calendarId) +
    "/events?" +
    "timeMin=" +
    encodeURIComponent(timeMin.toISOString()) +
    "&timeMax=" +
    encodeURIComponent(timeMax.toISOString()) +
    "&singleEvents=true" +
    "&orderBy=startTime";

  const response = UrlFetchApp.fetch(url, {
    headers: {
      Authorization: "Bearer " + service.getAccessToken(),
    },
    muteHttpExceptions: true,
  });

  const result = JSON.parse(response.getContentText());

  if (result.error) {
    throw new Error("Calendar API Error: " + result.error.message);
  }

  return result.items || [];
}

/**
 * Revokes a user's access (for logout/disconnect functionality).
 * @param {string} userEmail - The user's email.
 */
function revokeAccess(userEmail) {
  const service = getCalendarOAuthService(userEmail);
  service.reset();
}
