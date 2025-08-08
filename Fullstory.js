/**
 * Fullstory integration connector for Lexicon - Comprehensive API Coverage
 * Handles interactions with all FullStory v1 and v2 APIs
 * Serves as the foundation for webhook routes and MCP tools
 */
import fetch from 'node-fetch';
import ConnectorBase from './connectorBase.js';
import serviceRegistry from './serviceRegistry.js';

class FullstoryConnector extends ConnectorBase {
  constructor() {
    // Call parent constructor with the connector name
    super('Fullstory');
    
    // Use the ConnectorBase validation methods
    this.token = this.getConfig('fullstory_token');
    this.orgId = this.getConfig('fullstory_org_id');
    this.datacenter = this.getConfig('fullstory_dc', 'NA1');
    
    // Check if configuration is valid
    this.isConfigured = this.validator.checkIsConfigured();
    
    // Set base URLs based on data center
    if (this.datacenter === 'EU1') {
      this.baseUrl = 'https://api.eu1.fullstory.com';
      this.uiBaseUrl = 'https://app.eu1.fullstory.com';
    } else {
      // Default to NA1 (or any other data center)
      this.baseUrl = 'https://api.fullstory.com';
      this.uiBaseUrl = 'https://app.fullstory.com';
    }
    
    // API versions - comprehensive support
    this.apiVersion = 'v2';
    this.betaApiVersion = 'v2beta';
    this.legacyApiVersion = 'v1';
    this.supportedVersions = ['v1', 'v2', 'v2beta'];
    
    // Rate limiting
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.lastRequestTime = 0;
    this.minRequestInterval = 100; // 100ms between requests
  }

  /**
   * Connector-specific initialization logic
   * @returns {Promise<Object>} Initialization result details
   * @protected
   */
  async _initializeConnector() {
    return {
      status: this.isConfigured ? 'configured' : 'not_configured',
      datacenter: this.datacenter,
      orgId: this.orgId
    };
  }

  /**
   * Get authorization headers for API requests
   * @returns {Object} Headers object with authorization
   * @private
   */
  _getAuthHeaders() {
    return {
      "Accept": "application/json",
      "Integration-Source":"fs-lexicon",
      "Authorization": `Basic ${this.token}`
    };
  }

  /**
   * Format session identifier from user ID and session ID
   * @param {string} userId - User identifier
   * @param {string} sessionId - Session identifier
   * @returns {string} Formatted session identifier
   * @private
   */
  _formatSessionId(userId, sessionId) {
    if (!userId || !sessionId) {
      throw new Error('Both userId and sessionId are required');
    }
    return `${userId}%3A${sessionId}`;
  }

  /**
   * Make an API request to Fullstory with rate limiting
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _makeRequest(endpoint, options = {}) {
    return this.safeExecute(async () => {
      if (!this.isConfigured) {
        this.logger.warn(`API request to ${endpoint} skipped - connector not configured`);
        throw new Error('Fullstory connector not properly configured');
      }
      
      // Add to queue for rate limiting
      return new Promise((resolve, reject) => {
        this.requestQueue.push({
          endpoint,
          options,
          resolve,
          reject
        });
        
        this._processRequestQueue();
      });
    }, `makeRequest(${endpoint})`, null);
  }

  /**
   * Process request queue with rate limiting
   * @private
   */
  async _processRequestQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      
      try {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
          await new Promise(resolve => 
            setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
          );
        }
        
        const result = await this._executeRequest(request.endpoint, request.options);
        this.lastRequestTime = Date.now();
        request.resolve(result);
        
      } catch (error) {
        request.reject(error);
      }
    }
    
    this.isProcessingQueue = false;
  }

  /**
   * Execute the actual HTTP request
   * @private
   */
  async _executeRequest(endpoint, options) {
    const url = `${this.baseUrl}/${endpoint}`;
    
    this.logger.debug(`Making API request to ${url}`);
    
    const defaultOptions = {
      headers: this._getAuthHeaders()
    };
    
    const requestOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...(options.headers || {})
      }
    };
    
    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      let errorData = {};
      try {
        errorData = await response.json();
      } catch (e) {
        // Ignore JSON parse errors
      }
      
      const error = new Error(
        `Fullstory API error: ${response.status} ${errorData.message || response.statusText || 'Unknown error'}`
      );
      error.status = response.status;
      error.response = errorData;
      throw error;
    }

    // Handle 204 No Content responses
    if (response.status === 204) {
      return { success: true };
    }

    return await response.json();
  }


  /**
   * Generate a link to view the session in Fullstory UI
   * @param {string} userId - User identifier
   * @param {string} sessionId - Session identifier
   * @returns {string} URL to view session in Fullstory
   */
  getSessionLink(userId, sessionId) {
    try {
      this.checkInitialized(true);
      
      if (!userId || !sessionId) {
        return null;
      }
      const formattedId = this._formatSessionId(userId, sessionId);
      return `${this.uiBaseUrl}/ui/${this.orgId}/session/${formattedId}`;
    } catch (error) {
      this.logger.error("Failed to generate session link:", error);
      return null;
    }
  }

  /**
   * Post a custom event to Fullstory
   * @param {string} userId - User identifier
   * @param {string} sessionId - Session identifier
   * @param {Object} properties - Custom event properties
   * @returns {Promise<Object>} Response from the API
   */
  async postCustomEvent(userId, sessionId, properties) {
    return this.safeExecute(async () => {
      const payload = {
        "session": {
          "id": `${userId}:${sessionId}`,
        },
        "name": "Lexicon Multi-Event Fuser",
        "properties": properties
      };

      return await this._makeRequest(`${this.apiVersion}/events`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    }, `postCustomEvent(${userId}, ${sessionId})`, { status: 500, error: 'Operation failed' });
  }
  
  /**
   * Search for sessions based on criteria
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Array>} Array of matching sessions
   */
  async searchSessions(criteria) {
    return this.safeExecute(async () => {
      const payload = {
        ...criteria,
        limit: criteria.limit || 10
      };
      
      return await this._makeRequest(`${this.apiVersion}/sessions/search`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    }, `searchSessions(${JSON.stringify(criteria).substring(0, 50)}...)`, { sessions: [] });
  }

  // =============================================================================
  // V2 API - Users (Comprehensive)
  // =============================================================================

  /**
   * Create or update a user (FullStory v2)
   * Creates a new user or updates an existing user in FullStory.
   *
   * Official API docs: https://developer.fullstory.com/server/v2/users/create-or-update-user/
   *
   * @param {Object} userData - User data object. Fields include:
   *   @param {string} [userData.uid] - Unique user identifier (recommended, required for updates).
   *   @param {string} [userData.display_name] - The user's display name.
   *   @param {string} [userData.email] - The user's email address.
   *   @param {string} [userData.avatar_url] - URL to the user's avatar image.
   *   @param {string} [userData.phone] - The user's phone number.
   *   @param {string} [userData.role] - The user's role.
   *   @param {string} [userData.created_time] - ISO8601 timestamp for when the user was created.
   *   @param {Object} [userData.properties] - Custom user properties (key-value pairs).
   *   @param {Object} [userData.custom] - Additional custom fields.
   * @returns {Promise<Object>} Created or updated user object.
   */
  async createUser(userData) {
    return this._makeRequest(`${this.apiVersion}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
  }

  /**
   * Get user by ID (FullStory v2)
   * Retrieves a user by their unique user ID.
   *
   * Official API docs: https://developer.fullstory.com/server/v2/users/get-user/
   *
   * @param {string} userId - The user ID to retrieve. (Required)
   * @returns {Promise<Object>} User data object.
   */
  async getUser(userId) {
    return this._makeRequest(`${this.apiVersion}/users/${encodeURIComponent(userId)}`);
  }

  /**
   * Update user properties (FullStory v2)
   * Updates properties for an existing user by user ID.
   *
   * Official API docs: https://developer.fullstory.com/server/v2/users/update-user/
   *
   * @param {string} userId - The user ID to update. (Required)
   * @param {Object} updates - Properties to update. May include:
   *   @param {string} [updates.display_name] - The user's display name.
   *   @param {string} [updates.email] - The user's email address.
   *   @param {string} [updates.uid] - The unique user identifier.
   *   @param {string} [updates.avatar_url] - URL to the user's avatar image.
   *   @param {string} [updates.phone] - The user's phone number.
   *   @param {string} [updates.role] - The user's role.
   *   @param {string} [updates.created_time] - ISO8601 timestamp for when the user was created.
   *   @param {Object} [updates.properties] - Custom user properties (key-value pairs).
   *   @param {Object} [updates.custom] - Additional custom fields.
   * @returns {Promise<Object>} Updated user object.
   */
  async updateUser(userId, updates) {
    return this._makeRequest(`${this.apiVersion}/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  }

  /**
   * Delete user (FullStory v2)
   * Deletes a user by their unique user ID.
   *
   * Official API docs: https://developer.fullstory.com/server/v2/users/delete-user/
   *
   * @param {string} userId - The user ID to delete. (Required)
   * @returns {Promise<Object>} Deletion result object.
   */
  async deleteUser(userId) {
    return this._makeRequest(`${this.apiVersion}/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
  }

  /**
   * Batch create or update users (FullStory v2)
   * Creates or updates multiple users in a single batch operation.
   *
   * Official API docs: https://developer.fullstory.com/server/v2/users/batch-create-or-update-users/
   *
   * @param {Array<Object>} users - Array of user objects to create or update. Each user object may include:
   *   @param {string} [users.uid] - Unique user identifier (recommended, required for updates).
   *   @param {string} [users.display_name] - The user's display name.
   *   @param {string} [users.email] - The user's email address.
   *   @param {string} [users.avatar_url] - URL to the user's avatar image.
   *   @param {string} [users.phone] - The user's phone number.
   *   @param {string} [users.role] - The user's role.
   *   @param {string} [users.created_time] - ISO8601 timestamp for when the user was created.
   *   @param {Object} [users.properties] - Custom user properties (key-value pairs).
   *   @param {Object} [users.custom] - Additional custom fields.
   * @returns {Promise<Object>} Batch import job object.
   */
  async createUsersBatch(users) {
    return this._makeRequest(`${this.apiVersion}/users/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users })
    });
  }

  // =============================================================================
  // V2 API - Events (Comprehensive)
  // =============================================================================

  /**
   * Create custom event (FullStory v2)
   * Creates a custom event for a user or session.
   *
   * Official API docs: https://developer.fullstory.com/server/v2/events/create-event/
   *
   * @param {Object} eventData - Event data object. Fields include:
   *   @param {string} eventData.name - Name of the event (required).
   *   @param {string} [eventData.timestamp] - ISO8601 timestamp for the event.
   *   @param {Object} [eventData.properties] - Custom event properties (key-value pairs).
   *   @param {Object} [eventData.user] - User association. May include:
   *     @param {string} [eventData.user.uid] - User UID to associate the event with.
   *   @param {Object} [eventData.session] - Session association. May include:
   *     @param {string} [eventData.session.id] - Session ID to associate the event with.
   *     @param {boolean} [eventData.session.use_most_recent] - If true, associate with the user's most recent session.
   * @returns {Promise<Object>} Created event object.
   */
  async createEvent(eventData) {
    return this._makeRequest(`${this.apiVersion}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData)
    });
  }

  /**
   * Batch create events (FullStory v2)
   * Creates multiple custom events in a single batch operation.
   *
   * Official API docs: https://developer.fullstory.com/server/v2/events/batch-create-events/
   *
   * @param {Array<Object>} events - Array of event objects to create. Each event object may include:
   *   @param {string} events.name - Name of the event (required).
   *   @param {string} [events.timestamp] - ISO8601 timestamp for the event.
   *   @param {Object} [events.properties] - Custom event properties (key-value pairs).
   *   @param {Object} [events.user] - User association. May include:
   *     @param {string} [events.user.uid] - User UID to associate the event with.
   *   @param {Object} [events.session] - Session association. May include:
   *     @param {string} [events.session.id] - Session ID to associate the event with.
   *     @param {boolean} [events.session.use_most_recent] - If true, associate with the user's most recent session.
   * @returns {Promise<Object>} Batch import job object.
   */
  async createEventsBatch(events) {
    return this._makeRequest(`${this.apiVersion}/events/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events })
    });
  }

  /**
   * Get batch import job status (FullStory v2)
   * Retrieves the status of a batch import job for users or events.
   *
   * Official API docs: https://developer.fullstory.com/server/v2/batch/get-batch-job-status/
   *
   * @param {string} jobId - The batch job ID to check. (Required)
   * @returns {Promise<Object>} Job status object.
   */
  async getBatchJobStatus(jobId) {
    return this._makeRequest(`${this.apiVersion}/batch/${jobId}`);
  }

  /**
   * Get batch import job errors (FullStory v2)
   * Retrieves error details for a failed or completed batch import job.
   *
   * Official API docs: https://developer.fullstory.com/server/v2/batch/get-batch-job-errors/
   *
   * @param {string} jobId - The batch job ID to check for errors. (Required)
   * @returns {Promise<Object>} Job errors object.
   */
  async getBatchJobErrors(jobId) {
    return this._makeRequest(`${this.apiVersion}/batch/${jobId}/errors`);
  }

  // =============================================================================
  // V1 API - Legacy Support (Still Active)
  // =============================================================================

  /**
   * List sessions for a user (FullStory v1 List Sessions API)
   * See: https://developer.fullstory.com/server/v1/sessions/list-sessions/
   *
   * Returns a list of session replay URLs for a user, queried by email address and/or uid.
   * If both a uid and email parameter are passed, the endpoint returns a union of the records found.
   *
   * @param {Object} options - Query options
   * @param {string} [options.uid] - The uid set via FS.identify. Required if email is not provided.
   * @param {string} [options.email] - The email address associated with the user. Required if uid is not provided.
   * @param {number} [options.limit=20] - The max number of sessions to return (defaults to 20).
   * @returns {Promise<Object>} Object with a `sessions` array, each containing:
   *   - {string} userId: The user's ID
   *   - {string} sessionId: The session's ID
   *   - {string} createdTime: The session's creation time (epoch seconds)
   *   - {string} fsUrl: The FullStory session replay URL
   *
   * @throws {Error} If neither uid nor email is provided
   */
  async listSessions(options = {}) {
    const { uid, email, limit } = options;
    // Validate that at least uid or email is provided
    if (!uid && !email) {
      throw new Error('Either uid or email parameter is required');
    }
    const queryParams = new URLSearchParams();
    if (uid) queryParams.append('uid', uid);
    if (email) queryParams.append('email', email);
    if (limit) queryParams.append('limit', limit.toString());
    const queryString = queryParams.toString();
    // Correct endpoint: /sessions/v2?uid=...&email=...&limit=...
    const endpoint = `sessions/v2${queryString ? `?${queryString}` : ''}`;
    return this._makeRequest(endpoint);
  }

  /**
   * Set custom properties for a user (FullStory v1 Set User Properties API)
   * See: https://developer.fullstory.com/server/v1/users/set-user-properties/
   *
   * Set custom properties on a user who has previously been identified in the browser via FS.identify.
   *
   * @param {string} uid - The application-specific user ID (required, must match FS.identify in browser)
   * @param {Object} properties - User properties object. Keys are property names, values are property values.
   *   - System fields and custom fields must use the correct type suffixes (e.g., _str, _bool, _real). See FullStory docs for details.
   *   - Example: { displayName: 'Daniel Falko', email: 'daniel@example.com', pricingPlan_str: 'free', popupHelp_bool: true, totalSpent_real: 14.5 }
   * @param {Object} [options] - Optional parameters
   * @param {string} [options.integration] - Optional explicit integration field for integrations to mark their events.
   * @returns {Promise<Object>} Update result
   *
   * @throws {Error} If uid is not provided or invalid
   */
  async setUserPropertiesV1(uid, properties, options = {}) {
    // Correct endpoint: /users/v1/individual/{uid}/customvars
    return this._makeRequest(`users/v1/individual/${encodeURIComponent(uid)}/customvars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(properties)
    });
  }

  /**
   * Set custom events for a user (FullStory v1 Set User Events API)
   * See: https://developer.fullstory.com/server/v1/users/set-user-events/
   *
   * Capture custom events for users who have previously been identified in the browser via FS.identify.
   *
   * @param {string} uid - The application-specific user ID (required, must match FS.identify in browser)
   * @param {Array<Object>} events - Array of event objects. Each event object may include:
   *   - {string} event_name: Name of the event (required)
   *   - {Object} event_data: Key-value pairs for event properties (type-suffixed, e.g., id_int, priority_str)
   *   - {string} [timestamp]: ISO8601 timestamp for the event
   *   - {boolean} [use_recent_session]: If true, associate with the user's most recent session
   *   - {string} [session_url]: Associate with a specific session by URL
   *   - {string} [device_session]: Associate with a specific device session
   *
   * Only one of use_recent_session, session_url, or device_session may be provided per event.
   *
   * @returns {Promise<Object>} Update result
   *
   * @throws {Error} If uid is not provided or invalid
   */
  async setUserEventsV1(uid, events) {
    // Correct endpoint: /users/v1/individual/{uid}/customevent
    return this._makeRequest(`users/v1/individual/${encodeURIComponent(uid)}/customevent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: events })
    });
  }

  /**
   * Create segment export (FullStory v1)
   * Schedules an export based on the provided segment. The progress and results of the export can be fetched from the operations API.
   *
   * Official API docs: https://developer.fullstory.com/server/v1/segments/create-segment-export/
   *
   * @param {Object} segmentData - Segment export configuration object.
   * @param {string} segmentData.segmentId - The segment ID to export (as returned from the list segments API or found in the segment URL). Can include built-in segment IDs such as "everyone". (Required)
   * @param {string} segmentData.type - The type of data to export. Possible values: 'TYPE_EVENT', 'TYPE_INDIVIDUAL'. (Required)
   * @param {string} segmentData.format - The data format for the export. Possible values: 'FORMAT_JSON', 'FORMAT_CSV', 'FORMAT_NDJSON'. (Required)
   * @param {Object} segmentData.timeRange - The time range for the export. (Required)
   * @param {string} segmentData.timeRange.start - Start of the time range (ISO 8601 format, e.g. '2020-10-01T00:00:00Z').
   * @param {string} segmentData.timeRange.end - End of the time range (ISO 8601 format, e.g. '2020-11-01T00:00:00Z').
   * @param {Object} [segmentData.segmentTimeRange] - Optional. Overrides the segment's time range. Same structure as timeRange.
   * @param {string} [segmentData.segmentTimeRange.start] - Start of the segment time range (ISO 8601 format).
   * @param {string} [segmentData.segmentTimeRange.end] - End of the segment time range (ISO 8601 format).
   * @param {string} [segmentData.timezone] - Optional. IANA timezone string (e.g. 'America/New_York'). Defaults to UTC if not provided.
   * @param {string[]} [segmentData.fields] - Optional. Restricts the set of fields included in the export. If unspecified, all fields will be exported. Custom variables can be specified (e.g. 'user_*', 'evt_*').
   * @param {Object} [segmentData.eventDetails] - Optional. Additional event details for the export.
   * @returns {Promise<Object>} Export job operation object. Use the operationId to check status via the operations API.
   */
  async createSegmentExport(segmentData) {
    // Correct endpoint: /segments/v1/exports
    return this._makeRequest(`segments/v1/exports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(segmentData)
    });
  }

  /**
   * Get segment export status (FullStory v1)
   * Retrieves the status and details of a segment export job previously created via createSegmentExport.
   *
   * Official API docs: https://developer.fullstory.com/server/v1/segments/get-segment-export/
   *
   * @param {string} exportId - The export job ID returned from createSegmentExport. (Required)
   * @returns {Promise<Object>} Export status object, including progress and download URL if available.
   */
  async getSegmentExportStatus(exportId) {
    // Correct endpoint: /segments/v1/exports/{exportId}
    return this._makeRequest(`segments/v1/exports/${exportId}`);
  }

  /**
   * Get recording block rules (FullStory v1)
   * Retrieves the current privacy and recording block rules for the organization.
   *
   * Official API docs: https://developer.fullstory.com/server/v1/settings/get-recording-block-rules/
   *
   * @returns {Promise<Object>} Privacy settings and block rules object.
   */
  async getRecordingBlockRules() {
    // Correct endpoint: /settings/recording/v1/blocking
    return this._makeRequest(`settings/recording/v1/blocking`);
  }

  /**
   * Get user events (FullStory v1)
   * Retrieves a list of events for a specific user by UID.
   *
   * Official API docs: https://developer.fullstory.com/server/v1/users/get-user-events/
   *
   * @param {string} uid - The user UID (as set via FS.identify in the browser). (Required)
   * @param {Object} options - Query options (e.g., limit, start, end, event types).
   * @returns {Promise<Object>} User events object, including an array of events.
   */
  async getUserEvents(uid, options = {}) {
    const queryParams = new URLSearchParams(options).toString();
    // Correct endpoint: /users/v1/individual/{uid}/events
    const endpoint = `users/v1/individual/${encodeURIComponent(uid)}/events${queryParams ? `?${queryParams}` : ''}`;
    return this._makeRequest(endpoint);
  }

  /**
   * Get user pages (FullStory v1)
   * Retrieves a list of pages visited by a specific user by UID.
   *
   * Official API docs: https://developer.fullstory.com/server/v1/users/get-user-pages/
   *
   * @param {string} uid - The user UID (as set via FS.identify in the browser). (Required)
   * @param {Object} options - Query options (e.g., limit, start, end, page types).
   * @returns {Promise<Object>} User pages object, including an array of pages.
   */
  async getUserPages(uid, options = {}) {
    const queryParams = new URLSearchParams(options).toString();
    // Correct endpoint: /users/v1/individual/{uid}/pages
    const endpoint = `users/v1/individual/${encodeURIComponent(uid)}/pages${queryParams ? `?${queryParams}` : ''}`;
    return this._makeRequest(endpoint);
  }

  // =============================================================================
  // Webhook Integration Methods
  // =============================================================================

  /**
   * Create user from webhook data
   * @param {Object} webhookData - Data from webhook
   * @returns {Promise<Object>} Created user
   */
  async createUserFromWebhook(webhookData) {
    const userData = {
      uid: webhookData.uid || webhookData.user?.id,
      display_name: webhookData.display_name || webhookData.user?.display_name,
      email: webhookData.email || webhookData.user?.email,
      properties: {
        ...webhookData.properties,
        last_event: webhookData.event_name,
        last_seen: webhookData.timestamp || new Date().toISOString(),
        source: 'webhook'
      }
    };
    
    return this.createUser(userData);
  }

  /**
   * Create event from webhook data
   * @param {Object} webhookData - Webhook data
   * @returns {Promise<Object>} Created event
   */
  async createEventFromWebhook(webhookData) {
    const eventData = {
      name: webhookData.event_name || webhookData.name,
      timestamp: webhookData.timestamp || new Date().toISOString(),
      properties: {
        ...webhookData.properties,
        source: 'webhook'
      },
      user: {
        uid: webhookData.uid || webhookData.user?.id
      }
    };
    
    // Add session association if session ID is available
    if (webhookData.session_id) {
      eventData.session = {
        use_most_recent: true
      };
    }
    
    return this.createEvent(eventData);
  }

  /**
   * Process fusion webhook data
   * @param {Object} fusionData - Fusion webhook data
   * @returns {Promise<Object>} Processing result
   */
  async processFusionData(fusionData) {
    const results = {
      userCreated: false,
      eventCreated: false,
      errors: [],
      data: {}
    };
    
    try {
      // Create/update user
      if (fusionData.uid) {
        results.data.user = await this.createUserFromWebhook(fusionData);
        results.userCreated = true;
      }
    } catch (error) {
      results.errors.push(`User creation failed: ${error.message}`);
      this.logger.error('Fusion user creation error:', error);
    }
    
    try {
      // Create event
      if (fusionData.event_name) {
        results.data.event = await this.createEventFromWebhook(fusionData);
        results.eventCreated = true;
      }
    } catch (error) {
      results.errors.push(`Event creation failed: ${error.message}`);
      this.logger.error('Fusion event creation error:', error);
    }
    
    return results;
  }

  // =============================================================================
  // Analytics and Insights Methods
  // =============================================================================

  /**
   * Get comprehensive user profile
   * @param {string} userIdentifier - User ID or UID
   * @returns {Promise<Object>} Complete user profile
   */
  async getUserProfile(userIdentifier) {
    try {
      // Try v2 API first
      const user = await this.getUser(userIdentifier);
      
      // Enhance with v1 data if available
      try {
        const events = await this.getUserEvents(userIdentifier, { limit: 100 });
        const pages = await this.getUserPages(userIdentifier, { limit: 50 });
        
        return {
          ...user,
          recentEvents: events.events || [],
          recentPages: pages.pages || [],
          dataSource: 'v2+v1'
        };
      } catch (v1Error) {
        this.logger.debug('Could not fetch v1 data for user:', v1Error.message);
        return {
          ...user,
          dataSource: 'v2'
        };
      }
    } catch (error) {
      this.logger.error('Error fetching user profile:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive analytics for a user
   * @param {string} userIdentifier - User ID or UID
   * @param {Object} options - Analytics options
   * @returns {Promise<Object>} User analytics
   */
  async getUserAnalytics(userIdentifier, options = {}) {
    try {
      const profile = await this.getUserProfile(userIdentifier);
      
      // Add analytics calculations
      const analytics = {
        totalSessions: this._countSessionEvents(profile.recentEvents || []),
        totalEvents: profile.recentEvents?.length || 0,
        averageSessionDuration: this._calculateAverageSessionDuration(profile.recentEvents || []),
        mostFrequentEvents: this._getMostFrequentEvents(profile.recentEvents || []),
        conversionFunnel: this._calculateConversionFunnel(profile.recentEvents || []),
        lastActivity: profile.recentEvents?.[0]?.timestamp || null,
        engagementScore: this._calculateEngagementScore(profile.recentEvents || []),
        behaviorPattern: this._analyzeBehaviorPattern(profile.recentEvents || [])
      };
      
      return {
        ...profile,
        analytics
      };
      
    } catch (error) {
      this.logger.error('Error getting user analytics:', error);
      throw error;
    }
  }

  /**
   * Get session insights and patterns
   * Note: Raw events are not included in the response to reduce payload size.
   * Use getSessionEvents() separately if you need the complete event data.
   * 
   * @param {Object} args - Arguments object
   * @param {string} args.user_id - User ID
   * @param {string} args.session_id - Session ID  
   * @param {string} [args.outputMode='default'] - Output mode: 'verbose', 'default', or 'light'
   * @returns {Promise<Object>} Session insights
   */
  async getSessionInsights(args) {
    // Accepts { user_id, session_id, outputMode } for consistency with schema/dispatcher
    const userId = args.user_id || args.userId;
    const sessionId = args.session_id || args.sessionId;
    const outputMode = args.outputMode || args.output_mode || 'default';
    
    try {
      const [analysis, events] = await Promise.all([
        this.getSessionSummary(userId, sessionId),
        this.getSessionEvents(userId, sessionId)
      ]);
      
      // Process events once and reuse the processed data
      const processedEventData = this._processSessionEvents(events || []);
      
      // Build insights object based on output mode
      const insights = {
        ...analysis,
        sessionMetaInformation: processedEventData.sessionMetaInformation,
        sessionUrl: this.getSessionLink(userId, sessionId)
      };
      
      // Add additional data based on output mode
      if (outputMode.toLowerCase() === 'verbose') {
        // Verbose mode: include comprehensive analytics (no raw events - use getSessionEvents separately)
        insights.eventCount = processedEventData.eventCount;
        insights.uniqueEventTypes = processedEventData.uniqueEventTypes;
        insights.behavioralClustering = processedEventData.behavioralClustering;
        
      } else if (outputMode.toLowerCase() === 'default') {
        // Default mode: meta_information, analysis, eventCount, event types, and session flow
        insights.eventCount = processedEventData.eventCount;
        insights.uniqueEventTypes = processedEventData.uniqueEventTypes;
        insights.sessionFlow = processedEventData.behavioralClustering.sessionFlow;
        insights.behavioralCategories = processedEventData.behavioralClustering.behavioralCategories;
        
      } else if (outputMode.toLowerCase() === 'light') {
        // Light mode: minimal data - meta_information, analysis, and sessionUrl only
        // Only includes: analysis spread, sessionMetaInformation, sessionUrl
      }
      
      return insights;
    } catch (error) {
      this.logger.error('Error getting session insights:', error);
      throw error;
    }
  }

  /**
   * Extract session meta information from pre-sorted events
   * @param {Array} sortedEvents - Events already sorted by timestamp
   * @returns {Object} Session meta information
   * @private
   */
  _extractSessionMetaInformationFromSorted(sortedEvents) {
    if (sortedEvents.length === 0) {
      return {
        sourceProperties: {},
        location: {},
        device: {}
      };
    }

    // Find the first event that has source_properties (usually the first event)
    const firstEventWithMeta = sortedEvents.find(event => 
      event.source_properties || event.sourceProperties
    ) || sortedEvents[0];

    if (!firstEventWithMeta) {
      return {
        sourceProperties: {},
        location: {},
        device: {}
      };
    }

    const sourceProps = firstEventWithMeta.source_properties || firstEventWithMeta.sourceProperties || {};
    
    // Extract location and device separately as they have nested structures
    const location = sourceProps.location || {};
    const device = sourceProps.device || {};
    
    // Dynamically flatten all other source properties (excluding location and device to avoid duplication)
    const sourceProperties = {};
    Object.entries(sourceProps).forEach(([key, value]) => {
      if (key !== 'location' && key !== 'device') {
        sourceProperties[key] = value;
      }
    });
    
    return {
      sourceProperties,
      location,
      device
    };
  }

  /**
   * Generate event clustering from pre-sorted events
   * @param {Array} sortedEvents - Events already sorted by timestamp
   * @returns {Object} Event clustering data
   * @private
   */
  _generateEventClusteringFromSorted(sortedEvents) {
    if (sortedEvents.length === 0) {
      return { clusters: [], eventDistribution: {}, behavioralCategories: {} };
    }

    const totalEvents = sortedEvents.length;
    
    // Define behavioral categories based on FullStory event types
    const behavioralCategories = {
      'Navigation & Orientation': [],
      'Information Seeking & Learning': [],
      'Task Accomplishment & Management': [],
      'Communication & Community': [],
      'Entertainment & Leisure': [],
      'Feedback & Contribution': [],
      'Transaction & Acquisition': []
    };
    
    // Event type to behavioral category mapping
    const eventCategoryMapping = {
      // Navigation & Orientation
      'navigate': 'Navigation & Orientation',
      'page_view': 'Navigation & Orientation',
      'load': 'Navigation & Orientation',
      'back_forward': 'Navigation & Orientation',
      'reload': 'Navigation & Orientation',
      
      // Information Seeking & Learning
      'click': 'Information Seeking & Learning',
      'element_seen': 'Information Seeking & Learning',
      'highlight': 'Information Seeking & Learning',
      'copy': 'Information Seeking & Learning',
      'pinch_gesture': 'Information Seeking & Learning',
      'first_input_delay': 'Information Seeking & Learning',
      'interaction_to_next_paint': 'Information Seeking & Learning',
      
      // Task Accomplishment & Management
      'change': 'Task Accomplishment & Management',
      'form_abandon': 'Task Accomplishment & Management',
      'paste': 'Task Accomplishment & Management',
      'keyboard_open': 'Task Accomplishment & Management',
      'keyboard_close': 'Task Accomplishment & Management',
      'custom': 'Task Accomplishment & Management',
      'page_properties': 'Task Accomplishment & Management',
      
      // Communication & Community
      'identify': 'Communication & Community',
      'consent': 'Communication & Community',
      
      // Entertainment & Leisure
      'mouse_thrash': 'Entertainment & Leisure',
      'cumulative_layout_shift': 'Entertainment & Leisure',
      
      // Feedback & Contribution
      'console_message': 'Feedback & Contribution',
      'exception': 'Feedback & Contribution',
      'request': 'Feedback & Contribution',
      'crash': 'Feedback & Contribution',
      'low_memory': 'Feedback & Contribution',
    };
    
    // Categorize events by behavioral intent (single pass through sorted events)
    sortedEvents.forEach(event => {
      const eventType = event.event_type || event.name || 'unknown';
      let category = eventCategoryMapping[eventType];
      
      // Special logic for custom events and event name patterns
      if (!category) {
        if (eventType === 'custom' && (event.event_properties?.event_name || event.properties?.event_name)) {
          const customEventName = (event.event_properties?.event_name || event.properties?.event_name).toLowerCase();
          // Categorize based on custom event patterns
          if (customEventName.includes('purchase') || customEventName.includes('buy') || customEventName.includes('checkout')) {
            category = 'Transaction & Acquisition';
          } else if (customEventName.includes('search') || customEventName.includes('filter')) {
            category = 'Information Seeking & Learning';
          } else {
            category = 'Task Accomplishment & Management';
          }
        } else {
          // Default categorization for unknown events
          category = 'Task Accomplishment & Management';
        }
      }
      
      behavioralCategories[category].push(event);
    });
    
    // Analyze event distribution and create clusters
    const eventDistribution = {};
    Object.entries(behavioralCategories).forEach(([categoryName, categoryEvents]) => {
      categoryEvents.forEach(event => {
        const eventType = event.event_type || event.name || 'unknown';
        
        if (!eventDistribution[eventType]) {
          eventDistribution[eventType] = { total: 0, categories: {} };
        }
        eventDistribution[eventType].total++;
        
        if (!eventDistribution[eventType].categories[categoryName]) {
          eventDistribution[eventType].categories[categoryName] = 0;
        }
        eventDistribution[eventType].categories[categoryName]++;
      });
    });
    
    // Calculate percentages
    Object.keys(eventDistribution).forEach(eventType => {
      const dist = eventDistribution[eventType];
      Object.keys(dist.categories).forEach(category => {
        dist.categories[category] = Math.round((dist.categories[category] / dist.total) * 100);
      });
    });
    
    // Create clusters
    const clusters = [];
    Object.entries(eventDistribution).forEach(([eventType, data]) => {
      const dominantCategory = Object.entries(data.categories)
        .reduce((max, [category, percentage]) => 
          percentage > max.percentage ? { category, percentage } : max, 
          { category: null, percentage: 0 }
        );
      
      if (dominantCategory.percentage >= 70 && data.total >= 1) {
        clusters.push({
          eventType,
          category: dominantCategory.category,
          concentration: dominantCategory.percentage,
          count: data.total
        });
      }
    });
    
    clusters.sort((a, b) => b.concentration - a.concentration);
    
    // Calculate behavioral insights and session flow
    const behavioralInsights = this._analyzeBehavioralPatterns(behavioralCategories);
    const sessionFlow = this._analyzeSessionFlowFromSorted(sortedEvents);
    
    return {
      clusters,
      eventDistribution,
      behavioralCategories: Object.fromEntries(
        Object.entries(behavioralCategories).map(([category, events]) => [
          category, 
          {
            count: events.length,
            percentage: Math.round((events.length / totalEvents) * 100),
            events: events.map(e => ({ name: e.event_type || e.name, timestamp: e.event_time || e.timestamp }))
          }
        ])
      ),
      behavioralInsights,
      sessionFlow,
      totalEvents,
      sessionDuration: this._calculateSessionDurationFromSorted(sortedEvents),
      eventTypes: Object.keys(eventDistribution).length
    };
  }

  /**
   * Analyze session flow from pre-sorted events
   * @param {Array} sortedEvents - Events already sorted by timestamp
   * @returns {Object} Session flow analysis
   * @private
   */
  _analyzeSessionFlowFromSorted(sortedEvents) {
    if (sortedEvents.length < 2) {
      return { transitions: [], commonPaths: [], dropoffPoints: [] };
    }
    
    const transitions = [];
    const transitionCounts = {};
    
    // Analyze event transitions
    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const currentEvent = sortedEvents[i];
      const nextEvent = sortedEvents[i + 1];
      
      const from = currentEvent.event_type || currentEvent.name || 'unknown';
      const to = nextEvent.event_type || nextEvent.name || 'unknown';
      const timeDiff = new Date(nextEvent.event_time || nextEvent.timestamp) - 
                      new Date(currentEvent.event_time || currentEvent.timestamp);
      
      const transition = { from, to, timeDiff };
      transitions.push(transition);
      
      const pathKey = `${from} → ${to}`;
      transitionCounts[pathKey] = (transitionCounts[pathKey] || 0) + 1;
    }
    
    // Identify common paths
    const commonPaths = Object.entries(transitionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([path, count]) => ({ path, count }));
    
    // Identify dropoff points (long delays)
    const dropoffPoints = transitions
      .filter(t => t.timeDiff > 300000) // 5 minutes
      .map(t => ({
        afterEvent: t.from,
        beforeEvent: t.to,
        delayMinutes: Math.round(t.timeDiff / 60000)
      }));
    
    return { transitions, commonPaths, dropoffPoints };
  }

  /**
   * Calculate session duration from pre-sorted events
   * @param {Array} sortedEvents - Events already sorted by timestamp
   * @returns {number} Duration in seconds
   * @private
   */
  _calculateSessionDurationFromSorted(sortedEvents) {
    if (sortedEvents.length < 2) return 0;
    
    const startTime = new Date(sortedEvents[0].event_time || sortedEvents[0].timestamp);
    const endTime = new Date(sortedEvents[sortedEvents.length - 1].event_time || sortedEvents[sortedEvents.length - 1].timestamp);
    
    return Math.round((endTime - startTime) / 1000);
  }

  // =============================================================================
  // Bulk Operations and Advanced Features
  // =============================================================================

  /**
   * Bulk create users with validation
   * @param {Array} usersData - Array of user objects
   * @param {Object} options - Batch options
   * @returns {Promise<Object>} Batch operation result
   */
  async bulkCreateUsers(usersData, options = {}) {
    const { validateData = true, chunkSize = 100 } = options;
    
    if (validateData) {
      usersData = this._validateUsersData(usersData);
    }
    
    const results = [];
    
    // Process in chunks to avoid rate limits
    for (let i = 0; i < usersData.length; i += chunkSize) {
      const chunk = usersData.slice(i, i + chunkSize);
      
      try {
        const batchResult = await this.createUsersBatch(chunk);
        results.push(batchResult);
        
        // Wait between chunks to respect rate limits
        if (i + chunkSize < usersData.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        this.logger.error(`Batch user creation failed for chunk ${i}-${i + chunkSize}:`, error);
        results.push({ error: error.message, chunk: i });
      }
    }
    
    return {
      totalUsers: usersData.length,
      chunks: results.length,
      results
    };
  }

  /**
   * Bulk create events with validation
   * @param {Array} eventsData - Array of event objects
   * @param {Object} options - Batch options
   * @returns {Promise<Object>} Batch operation result
   */
  async bulkCreateEvents(eventsData, options = {}) {
    const { validateData = true, chunkSize = 100 } = options;
    
    if (validateData) {
      eventsData = this._validateEventsData(eventsData);
    }
    
    const results = [];
    
    // Process in chunks to avoid rate limits
    for (let i = 0; i < eventsData.length; i += chunkSize) {
      const chunk = eventsData.slice(i, i + chunkSize);
      
      try {
        const batchResult = await this.createEventsBatch(chunk);
        results.push(batchResult);
        
        // Wait between chunks to respect rate limits
        if (i + chunkSize < eventsData.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        this.logger.error(`Batch event creation failed for chunk ${i}-${i + chunkSize}:`, error);
        results.push({ error: error.message, chunk: i });
      }
    }
    
    return {
      totalEvents: eventsData.length,
      chunks: results.length,
      results
    };
  }

  /**
   * Export data for analytics or migration
   * @param {Object} exportConfig - Export configuration
   * @returns {Promise<Object>} Export result
   */
  async exportData(exportConfig) {
    const {
      type = 'sessions', // sessions, users, events
      filters = {},
      format = 'json', // json, csv
      dateRange,
      limit = 1000
    } = exportConfig;
    
    try {
      let data = [];
      
      switch (type) {
        case 'sessions':
          const sessions = await this.listSessions({ ...filters, limit });
          data = (sessions.sessions || sessions).map(session => ({
            id: session.id,
            userId: session.user_id,
            timestamp: session.timestamp,
            duration: session.duration,
            eventCount: session.event_count || 0,
            url: session.id ? this.getSessionLink(session.user_id, session.id) : null
          }));
          break;
          
        case 'segment':
          if (filters.segmentId) {
            const exportJob = await this.createSegmentExport({
              segment_id: filters.segmentId,
              format: format === 'csv' ? 'csv' : 'json'
            });
            return { exportJobId: exportJob.id, status: 'processing' };
          }
          throw new Error('Segment ID required for segment export');
          
        default:
          throw new Error(`Unsupported export type: ${type}`);
      }
      
      return {
        type,
        count: data.length,
        format,
        timestamp: new Date().toISOString(),
        data: format === 'csv' ? this._convertToCSV(data) : data
      };
      
    } catch (error) {
      this.logger.error('Error exporting data:', error);
      throw error;
    }
  }

  /**
   * Health check for FullStory API connectivity
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      // Try a simple API call to verify connectivity
      await this.listSessions({ limit: 1 });
      
      return {
        status: 'healthy',
        datacenter: this.datacenter,
        timestamp: new Date().toISOString(),
        supportedVersions: this.supportedVersions
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        datacenter: this.datacenter,
        timestamp: new Date().toISOString()
      };
    }
  }

  // =============================================================================
  // Private Helper Methods for Analytics and Utilities
  // =============================================================================

  /**
   * Process session events once and return all derived data
   * This eliminates duplication by processing events in a single pass
   * @param {Array} events - Raw session events
   * @returns {Object} All processed event data
   * @private
   */
  _processSessionEvents(events) {
    if (!events || events.length === 0) {
      return {
        eventCount: 0,
        uniqueEventTypes: 0,
        sortedEvents: [],
        sessionMetaInformation: { sourceProperties: {}, location: {}, device: {} },
        behavioralClustering: { clusters: [], eventDistribution: {}, behavioralCategories: {} }
      };
    }

    // Sort events once
    const sortedEvents = events.sort((a, b) => 
      new Date(a.event_time || a.timestamp) - new Date(b.event_time || b.timestamp)
    );

    // Extract basic metrics
    const eventCount = events.length;
    const uniqueEventTypes = [...new Set(events.map(e => e.event_type || e.name))].length;

    // Extract session meta information (from first event with metadata)
    const sessionMetaInformation = this._extractSessionMetaInformationFromSorted(sortedEvents);

    // Generate behavioral clustering (comprehensive analysis including session flow)
    const behavioralClustering = this._generateEventClusteringFromSorted(sortedEvents);

    return {
      eventCount,
      uniqueEventTypes,
      sortedEvents,
      sessionMetaInformation,
      behavioralClustering
    };
  }

  /**
   * Count session-related events
   * @param {Array} events - User events
   * @returns {number} Session count
   * @private
   */
  _countSessionEvents(events) {
    return events.filter(e => 
      e.name === 'session_start' || e.name === 'new_session'
    ).length;
  }

  /**
   * Calculate average session duration
   * @param {Array} events - User events
   * @returns {number} Average duration in minutes
   * @private
   */
  _calculateAverageSessionDuration(events) {
    const sessionPairs = [];
    let currentSession = null;
    
    for (const event of events) {
      const eventName = event.event_type || event.name;
      const eventTimestamp = event.event_time || event.timestamp;
      
      if (eventName === 'session_start' || eventName === 'new_session') {
        currentSession = { ...event, name: eventName, timestamp: eventTimestamp };
      } else if (eventName === 'session_end' && currentSession) {
        const duration = new Date(eventTimestamp) - new Date(currentSession.timestamp);
        sessionPairs.push(duration);
        currentSession = null;
      }
    }
    
    if (sessionPairs.length === 0) return 0;
    
    const averageMs = sessionPairs.reduce((sum, duration) => sum + duration, 0) / sessionPairs.length;
    return Math.round(averageMs / (1000 * 60)); // Convert to minutes
  }

  /**
   * Get most frequent events
   * @param {Array} events - User events
   * @returns {Array} Event frequency data
   * @private
   */
  _getMostFrequentEvents(events) {
    const eventCounts = {};
    
    for (const event of events) {
      const eventName = event.event_type || event.name || 'unknown';
      eventCounts[eventName] = (eventCounts[eventName] || 0) + 1;
    }
    
    return Object.entries(eventCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }

  /**
   * Calculate conversion funnel metrics
   * @param {Array} events - User events
   * @returns {Object} Funnel metrics
   * @private
   */
  _calculateConversionFunnel(events) {
    const funnelEvents = [
      'page_view', 'product_view', 'add_to_cart', 
      'checkout_start', 'checkout', 'purchase', 'signup'
    ];
    const funnel = {};
    
    for (const stage of funnelEvents) {
      funnel[stage] = events.filter(e => 
        e.name === stage || e.name.toLowerCase().includes(stage.replace('_', ''))
      ).length;
    }
    
    return funnel;
  }

  /**
   * Calculate engagement score based on events
   * @param {Array} events - User events
   * @returns {number} Engagement score (0-100)
   * @private
   */
  _calculateEngagementScore(events) {
    if (events.length === 0) return 0;
    
    const weights = {
      page_view: 1,
      click: 2,
      form_interaction: 3,
      video_play: 4,
      purchase: 10,
      signup: 10
    };
    
    let totalScore = 0;
    let maxPossibleScore = 0;
    
    for (const event of events) {
      const eventName = event.event_type || event.name;
      const weight = weights[eventName] || 1;
      totalScore += weight;
      maxPossibleScore += 10; // Max weight
    }
    
    return Math.min(100, Math.round((totalScore / maxPossibleScore) * 100));
  }

  /**
   * Analyze behavior pattern
   * @param {Array} events - User events
   * @returns {Object} Behavior pattern
   * @private
   */
  _analyzeBehaviorPattern(events) {
    if (events.length === 0) {
      return { pattern: 'no_data', confidence: 0 };
    }
    
    const patterns = {
      explorer: events.filter(e => e.name === 'page_view').length > events.length * 0.7,
      converter: events.some(e => ['purchase', 'signup', 'conversion'].includes(e.name)),
      researcher: events.filter(e => e.name.includes('search') || e.name.includes('filter')).length > 5,
      social: events.filter(e => e.name.includes('share') || e.name.includes('comment')).length > 2
    };
    
    const dominantPattern = Object.entries(patterns)
      .filter(([, value]) => value)
      .map(([key]) => key)[0] || 'casual';
    
    return {
      pattern: dominantPattern,
      confidence: this._calculatePatternConfidence(events, dominantPattern),
      traits: Object.entries(patterns).filter(([, value]) => value).map(([key]) => key)
    };
  }

  /**
   * Calculate pattern confidence
   * @param {Array} events - User events
   * @param {string} pattern - Identified pattern
   * @returns {number} Confidence score (0-1)
   * @private
   */
  _calculatePatternConfidence(events, pattern) {
    // Simple confidence calculation based on event consistency
    const totalEvents = events.length;
    if (totalEvents < 5) return 0.3; // Low confidence for few events
    if (totalEvents < 20) return 0.6; // Medium confidence
    return 0.8; // High confidence for many events
  }

  /**
   * Analyze behavioral patterns from categorized events
   * @param {Object} behavioralCategories - Events grouped by behavioral categories
   * @returns {Object} Behavioral pattern analysis
   * @private
   */
  _analyzeBehavioralPatterns(behavioralCategories) {
    const totalEvents = Object.values(behavioralCategories).reduce((sum, events) => sum + events.length, 0);
    
    if (totalEvents === 0) {
      return { 
        primaryBehavior: 'no_activity', 
        confidence: 0, 
        behaviorTraits: [],
        engagementLevel: 'none'
      };
    }
    
    // Calculate category distributions
    const categoryDistribution = {};
    Object.entries(behavioralCategories).forEach(([category, events]) => {
      categoryDistribution[category] = {
        count: events.length,
        percentage: Math.round((events.length / totalEvents) * 100)
      };
    });
    
    // Identify primary behavior (highest percentage category with meaningful activity)
    const significantCategories = Object.entries(categoryDistribution)
      .filter(([, data]) => data.percentage >= 15) // At least 15% of activity
      .sort(([, a], [, b]) => b.percentage - a.percentage);
    
    const primaryBehavior = significantCategories.length > 0 
      ? significantCategories[0][0] 
      : 'mixed_activity';
    
    const primaryPercentage = significantCategories.length > 0 
      ? significantCategories[0][1].percentage 
      : 0;
    
    // Determine confidence based on concentration and total events
    let confidence = 0;
    if (totalEvents >= 20 && primaryPercentage >= 50) {
      confidence = 0.9;
    } else if (totalEvents >= 10 && primaryPercentage >= 40) {
      confidence = 0.7;
    } else if (totalEvents >= 5 && primaryPercentage >= 30) {
      confidence = 0.5;
    } else {
      confidence = 0.3;
    }
    
    // Identify behavioral traits (secondary behaviors)
    const behaviorTraits = significantCategories
      .slice(1, 4) // Up to 3 secondary behaviors
      .map(([category, data]) => ({
        behavior: category,
        strength: data.percentage >= 25 ? 'strong' : 'moderate'
      }));
    
    // Determine engagement level
    let engagementLevel = 'low';
    if (totalEvents >= 50) {
      engagementLevel = 'high';
    } else if (totalEvents >= 20) {
      engagementLevel = 'medium';
    } else if (totalEvents >= 5) {
      engagementLevel = 'moderate';
    }
    
    // Calculate behavioral diversity (how spread out the activity is)
    const activeCategoriesCount = Object.values(categoryDistribution)
      .filter(data => data.count > 0).length;
    const behavioralDiversity = activeCategoriesCount / Object.keys(behavioralCategories).length;
    
    // Generate behavioral insights
    const insights = [];
    
    if (primaryPercentage >= 60) {
      insights.push(`Highly focused on ${primaryBehavior.toLowerCase()}`);
    } else if (behavioralDiversity >= 0.6) {
      insights.push('Demonstrates diverse behavioral patterns');
    }
    
    if (categoryDistribution['Navigation & Orientation']?.percentage >= 30) {
      insights.push('Strong exploration and navigation behavior');
    }
    
    if (categoryDistribution['Transaction & Acquisition']?.percentage >= 20) {
      insights.push('Shows commercial intent and conversion behavior');
    }
    
    if (categoryDistribution['Information Seeking & Learning']?.percentage >= 40) {
      insights.push('Exhibits research and information-gathering patterns');
    }
    
    return {
      primaryBehavior,
      primaryPercentage,
      confidence,
      behaviorTraits,
      engagementLevel,
      behavioralDiversity: Math.round(behavioralDiversity * 100),
      categoryDistribution,
      insights,
      totalEvents
    };
  }

  /**
   * Analyze conversion path
   * @param {Array} events - Session events
   * @returns {Array} Conversion path
   * @private
   */
  _analyzeConversionPath(events) {
    const conversionEvents = ['page_view', 'product_view', 'add_to_cart', 'checkout', 'purchase'];
    
    return events
      .filter(event => conversionEvents.includes(event.event_type || event.name))
      .sort((a, b) => new Date(a.event_time || a.timestamp) - new Date(b.event_time || b.timestamp));
  }

  /**
   * Validate users data for batch operations
   * @param {Array} usersData - Users data
   * @returns {Array} Validated users data
   * @private
   */
  _validateUsersData(usersData) {
    return usersData.filter(user => {
      if (!user.uid && !user.id) {
        this.logger.warn('Skipping user without uid or id:', user);
        return false;
      }
      return true;
    });
  }

  /**
   * Validate events data for batch operations
   * @param {Array} eventsData - Events data
   * @returns {Array} Validated events data
   * @private
   */
  _validateEventsData(eventsData) {
    return eventsData.filter(event => {
      if (!event.name && !event.event_type) {
        this.logger.warn('Skipping event without name or event_type:', event);
        return false;
      }
      return true;
    });
  }

  /**
   * Convert data to CSV format
   * @param {Array} data - Data to convert
   * @returns {string} CSV string
   * @private
   */
  _convertToCSV(data) {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(',')
      )
    ];
    
    return csvRows.join('\n');
  }

  /**
   * Migrate v1 user properties to v2 format
   * @param {Object} v1Properties - v1 properties with type suffixes
   * @returns {Object} v2 formatted properties
   */
  migrateV1PropertiesToV2(v1Properties) {
    const v2Properties = {};
    
    for (const [key, value] of Object.entries(v1Properties)) {
      // Remove type suffixes (_str, _bool, _real, _int, _date)
      const cleanKey = key.replace(/_(str|bool|real|int|date)$/, '');
      v2Properties[cleanKey] = value;
    }
    
    return v2Properties;
  }

  /**
   * Generate session URL from session components
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {string} Session URL
   */
  generateSessionUrl(userId, sessionId) {
    if (!userId || !sessionId) {
      return null;
    }
    const formattedId = this._formatSessionId(userId, sessionId);
    return `${this.uiBaseUrl}/ui/${this.orgId}/session/${formattedId}`;
  }

  /**
   * Create event with smart session association
   * @param {Object} eventData - Event data
   * @returns {Promise<Object>} Created event
   */
  async createEventWithSessionAssociation(eventData) {
    // If session ID is provided, use it directly
    if (eventData.session?.id) {
      return this.createEvent(eventData);
    }
    
    // If user is specified and use_most_recent is true, let FullStory handle it
    if (eventData.user && eventData.session?.use_most_recent) {
      return this.createEvent(eventData);
    }
    
    // Otherwise create event without session association
    return this.createEvent(eventData);
  }

  /**
   * Get a session profile
   * See: https://developer.fullstory.com/server/beta/sessions/get/
   * Retrieves a session profile by its profile ID. Only the profile ID is required and supported.
   *
   * @param {Object} params - Parameters for profile retrieval
   * @param {string} params.profile_id - The session profile ID (required, used as a path parameter)
   * @returns {Promise<Object>} Session profile object
   */
  async getSessionProfile(params) {
    const { profile_id } = params;
    if (!profile_id) throw new Error('profile_id is required');
    const endpoint = `${this.betaApiVersion}/visit_profile/${encodeURIComponent(profile_id)}`;
    return this._makeRequest(endpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
  }

  /**
   * Create a session profile
   * See: https://developer.fullstory.com/server/beta/sessions/create-profile/
   * Creates a new session profile with the provided parameters.
   *
   * @param {Object} params - Parameters for profile creation
   * @param {string} params.profile_id - The session profile ID (required)
   * @param {Object} [params.slice] - Optional. Slicing options for the session. May include:
   *   @param {('UNSPECIFIED'|'FIRST'|'LAST'|'TIMESTAMP')} [params.slice.mode] - Slicing mode
   *   @param {number} [params.slice.event_limit] - Limit number of events
   *   @param {number} [params.slice.duration_limit_ms] - Limit session duration in ms
   *   @param {string} [params.slice.start_timestamp] - Start timestamp for slicing (ISO8601)
   * @param {Object} [params.context] - Optional. Context configuration. May include:
   *   @param {Array<string>} [params.context.include] - Fields to include in the context
   *   @param {Array<string>} [params.context.exclude] - Fields to exclude from the context
   * @param {Object} [params.events] - Optional. Events configuration. May include:
   *   @param {Array<string>} [params.events.include_types] - Event types to include
   *   @param {Array<string>} [params.events.exclude_types] - Event types to exclude
   * @param {Object} [params.cache] - Optional. Cache configuration (object)
   * @param {Object} [params.llm] - Optional. LLM configuration. May include:
   *   @param {string} [params.llm.model] - LLM model to use (e.g., 'GEMINI_2_FLASH', 'GEMINI_2_FLASH_LITE')
   *   @param {number} [params.llm.temperature] - LLM temperature (randomness)
   * @param {string} [params.name] - Optional. The display name of the profile
   * @returns {Promise<Object>} Created session profile object
   */
  async createSessionProfile(params) {
    if (!params || !params.profile_id) throw new Error('profile_id is required');
    const endpoint = `${this.betaApiVersion}/visit_profile`;
    return this._makeRequest(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(params)
    });
  }

  /**
   * Update a session profile
   * See: https://developer.fullstory.com/server/beta/sessions/update/
   * Updates a session profile by its profile ID. The profile ID is required and used as a path parameter.
   *
   * @param {Object} params - Parameters for profile update
   * @param {string} params.profile_id - The session profile ID (required, used as a path parameter)
   * @param {Object} [params.slice] - Optional. Slicing options for the session. May include:
   *   @param {('UNSPECIFIED'|'FIRST'|'LAST'|'TIMESTAMP')} [params.slice.mode] - Slicing mode
   *   @param {number} [params.slice.event_limit] - Limit number of events
   *   @param {number} [params.slice.duration_limit_ms] - Limit session duration in ms
   *   @param {string} [params.slice.start_timestamp] - Start timestamp for slicing (ISO8601)
   * @param {Object} [params.context] - Optional. Context configuration. May include:
   *   @param {Array<string>} [params.context.include] - Fields to include in the context
   *   @param {Array<string>} [params.context.exclude] - Fields to exclude from the context
   * @param {Object} [params.events] - Optional. Events configuration. May include:
   *   @param {Array<string>} [params.events.include_types] - Event types to include
   *   @param {Array<string>} [params.events.exclude_types] - Event types to exclude
   * @param {Object} [params.cache] - Optional. Cache configuration (object)
   * @param {Object} [params.llm] - Optional. LLM configuration. May include:
   *   @param {string} [params.llm.model] - LLM model to use (e.g., 'GEMINI_2_FLASH', 'GEMINI_2_FLASH_LITE')
   *   @param {number} [params.llm.temperature] - LLM temperature (randomness)
   * @param {string} [params.name] - Optional. The display name of the profile
   * @returns {Promise<Object>} Created session profile object
   */
  async updateSessionProfile(params) {
    const { profile_id, ...body } = params;
    if (!profile_id) throw new Error('profile_id is required');
    const endpoint = `${this.betaApiVersion}/visit_profile/${encodeURIComponent(profile_id)}`;
    return this._makeRequest(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  /**
   * Delete a session profile
   * See: https://developer.fullstory.com/server/beta/sessions/delete/
   * Deletes a session profile by its profile ID. The profile ID is required and used as a path parameter.
   *
   * @param {Object} params - Parameters for deletion

   * @param {string} params.profile_id - The session profile ID (required, used as path parameter)
   * @param {Object} [params.slice] - Optional. Slicing options for the session.
   * @param {Object} [params.context] - Optional. Context configuration.
   * @param {Object} [params.events] - Optional. Events configuration.
   * @param {Object} [params.cache] - Optional. Cache configuration.
   * @param {Object} [params.llm] - Optional. LLM configuration.
   * @param {string} [params.name] - Optional. The display name of the profile.
   * @returns {Promise<Object>} Deletion result
   */
  async deleteSessionProfile(params) {
    const { profile_id, ...body } = params;
    if (!profile_id) throw new Error('profile_id is required');
    const endpoint = `${this.betaApiVersion}/visit_profile/${encodeURIComponent(profile_id)}`;
    return this._makeRequest(endpoint, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: Object.keys(body).length ? JSON.stringify(body) : undefined
    });
  }

  /**
   * List session profiles
   * See: https://developer.fullstory.com/server/beta/sessions/list-profiles/
   * Retrieves a list of session profiles, optionally filtered by query parameters.
   *
   * @param {Object} [params] - Optional query parameters for filtering profiles.
   * @param {string} [params.query] - Search query string to filter profiles by name or ID.
   * @param {number} [params.limit] - Maximum number of profiles to return (default: 100).
   * @param {number} [params.offset] - Number of profiles to skip for pagination (default: 0).
   * @param {string} [params.sort] - Sort order (e.g., 'created_time', 'name').
   * @returns {Promise<Object>} List of session profiles and pagination info.
   */
  async listSessionProfiles(params = {}) {
    const queryParams = new URLSearchParams();
    if (params.query) queryParams.append('query', params.query);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);
    if (params.sort) queryParams.append('sort', params.sort);
    const endpoint = `${this.betaApiVersion}/visit_profile${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    return this._makeRequest(endpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
  }

  /**
   * Generate context for a specific session (FullStory Beta)
   *
   * Generates a context object for a session, including user, session, and event context, with optional configuration.
   *
   * Official API docs: https://developer.fullstory.com/server/beta/sessions/generate-context/
   *
   * @param {string} sessionId - The unique identifier for the session (required).
   * @param {Object} [options] - Optional configuration for context generation.
   * @param {string} [options.config_profile] - Optional configuration profile to use for context generation.
   * @param {Object} [options.slice] - Optional. Slicing options for the session. May include:
   *   @param {('UNSPECIFIED'|'FIRST'|'LAST'|'TIMESTAMP')} [options.slice.mode] - Slicing mode.
   *   @param {number} [options.slice.event_limit] - Limit number of events.
   *   @param {number} [options.slice.duration_limit_ms] - Limit session duration in ms.
   *   @param {string} [options.slice.start_timestamp] - Start timestamp for slicing (ISO8601).
   * @param {Object} [options.context] - Optional. Context configuration. May include:
   *   @param {Array<string>} [options.context.include] - Fields to include in the context.
   *   @param {Array<string>} [options.context.exclude] - Fields to exclude from the context.
   * @param {Object} [options.events] - Optional. Events configuration. May include:
   *   @param {Array<string>} [options.events.include_types] - Event types to include.
   *   @param {Array<string>} [options.events.exclude_types] - Event types to exclude.
   * @param {Object} [options.cache] - Optional. Cache configuration (object).
   * @param {Object} [options.llm] - Optional. LLM configuration. May include:
   *   @param {string} [options.llm.model] - LLM model to use (e.g., 'GEMINI_2_FLASH', 'GEMINI_2_FLASH_LITE').
   *   @param {number} [options.llm.temperature] - LLM temperature (randomness).
   * @returns {Promise<Object>} The generated session context object.
   * @throws {Error} If the API request fails or sessionId is missing/invalid.
   */
  async generateSessionContext(sessionId, options = {}) {
    if (!sessionId) throw new Error('sessionId is required');
    const query = options.config_profile ? `?config_profile=${encodeURIComponent(options.config_profile)}` : '';
    const endpoint = `${this.betaApiVersion}/sessions/${encodeURIComponent(sessionId)}/context${query}`;
    // Remove config_profile from body if present
    const { config_profile, ...body } = options;
    return this._makeRequest(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: Object.keys(body).length ? JSON.stringify(body) : undefined
    });
  }

  /**
   * Get events for a specific session
   * @param {string} userId - User identifier
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Array>} Array of session events
   */
  async getSessionEvents(userId, sessionId) {
    // Accepts optional enableEventCache parameter
    return this.safeExecute(async (...args) => {
      // Support legacy signature: (userId, sessionId) or (userId, sessionId, options)
      let enableEventCache = undefined;
      if (args.length === 3 && typeof args[2] === 'object' && args[2] !== null) {
        enableEventCache = args[2].enableEventCache;
      } else if (args.length === 3 && typeof args[2] === 'boolean') {
        enableEventCache = args[2];
      }
      const formattedId = this._formatSessionId(userId, sessionId);
      let endpoint = `${this.betaApiVersion}/sessions/${formattedId}/events`;
      if (enableEventCache !== undefined) {
        endpoint += `?enable_event_cache=${enableEventCache ? 'true' : 'false'}`;
      }
      const data = await this._makeRequest(endpoint);
      return data.events;
    }, `getSessionEvents(${userId}, ${sessionId}${typeof enableEventCache !== 'undefined' ? ', enableEventCache=' + enableEventCache : ''})`, null);
  }

  /**
   * Generate a summary for a specific session
   *
   * Generates a summary of a session, including key metrics, insights, and highlights.
   *
   * Official API docs: https://developer.fullstory.com/server/beta/sessions/generate-summary/
   *
   * @param {string} userId - The unique identifier for the user (required).
   * @param {string} sessionId - The unique identifier for the session (required).
   * @param {string} [configProfile] - Optional configuration profile to use for the summary (see API docs).
   * @returns {Promise<Object>} A promise that resolves to the session summary object
   * @throws {Error} If the API request fails or parameters are missing/invalid
   */
  async getSessionSummary(userId, sessionId, configProfile) {
    return this.safeExecute(async () => {
      if (!userId || !sessionId) {
        throw new Error('Both userId and sessionId are required');
      }
      const formattedId = this._formatSessionId(userId, sessionId);
      let endpoint = `${this.betaApiVersion}/sessions/${formattedId}/summary`;
      if (configProfile) {
        endpoint += `?config_profile=${encodeURIComponent(configProfile)}`;
      }
      return await this._makeRequest(endpoint);
    }, `getSessionSummary(${userId}, ${sessionId}${configProfile ? ', ' + configProfile : ''})`, null);
  }
}

// Create a singleton instance
const fullstoryConnector = new FullstoryConnector();

// Initialize the connector - ConnectorBase now handles initialization tracking through the service registry
fullstoryConnector.initialize()
  .catch(error => {
    console.error('Error initializing Fullstory connector:', error);
  });

// Register in the service registry
serviceRegistry.register('fullstory', fullstoryConnector);

export default fullstoryConnector;