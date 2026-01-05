/**
 * Notion API Wrapper
 */
class NotionAPI {
  /**
   * @param {string} apiKey - The Notion Integration Token
   */
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.notion.com/v1";
    this.version = "2022-06-28";
  }

  /**
   * Get auth headers
   */
  headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Notion-Version": this.version,
      "Content-Type": "application/json",
    };
  }

  /**
   * Make a request to the Notion API
   */
  request(endpoint, method, payload) {
    const options = {
      method: method,
      headers: this.headers(),
      muteHttpExceptions: true,
    };
    if (payload) {
      options.payload = JSON.stringify(payload);
    }

    // Simple rate limit compliance (approx 3 req/s)
    Utilities.sleep(340);

    const response = UrlFetchApp.fetch(`${this.baseUrl}${endpoint}`, options);
    const code = response.getResponseCode();
    const content = response.getContentText();

    if (code >= 400) {
      throw new Error(`Notion API Error ${code}: ${content}`);
    }

    return JSON.parse(content);
  }

  /**
   * Create a page in a database
   * @param {Object} payload - The page properties
   */
  createPage(payload) {
    return this.request("/pages", "post", payload);
  }

  /**
   * Search for pages
   * @param {Object} payload
   */
  search(payload) {
    return this.request("/search", "post", payload);
  }

  /**
   * Query a database
   * @param {string} databaseId
   * @param {Object} payload
   */
  queryDatabase(databaseId, payload) {
    return this.request(`/databases/${databaseId}/query`, "post", payload);
  }

  /**
   * Update a page properties
   * @param {string} pageId
   * @param {Object} payload
   */
  updatePage(pageId, payload) {
    return this.request(`/pages/${pageId}`, "patch", payload);
  }
}
