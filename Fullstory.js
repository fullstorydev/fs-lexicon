/**
 * Fullstory integration connector for Lexicon
 * Handles interactions with Fullstory API and data
 */
const fetch = require('node-fetch');
const ConnectorBase = require('./connectorBase');
const serviceRegistry = require('./serviceRegistry');

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
    
    // API versions
    this.apiVersion = 'v2';
    this.betaApiVersion = 'v2beta';
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
   * Make an API request to Fullstory
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Fullstory API error: ${response.status} ${errorData.message || response.statusText || 'Unknown error'}`);
      }

      return await response.json();
    }, `makeRequest(${endpoint})`, null);
  }

  /**
   * Get events for a specific session
   * @param {string} userId - User identifier
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Array>} Array of session events
   */
  async getSessionEvents(userId, sessionId) {
    return this.safeExecute(async () => {
      const formattedId = this._formatSessionId(userId, sessionId);
      const data = await this._makeRequest(`${this.betaApiVersion}/sessions/${formattedId}/events`);
      return data.events;
    }, `getSessionEvents(${userId}, ${sessionId})`, null);
  }

  /**
   * Get session analysis/summary
   * @param {string} userId - User identifier
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object>} Session analysis data
   */
  async getSessionSummary(userId, sessionId) {
    return this.safeExecute(async () => {
      const formattedId = this._formatSessionId(userId, sessionId);
      return await this._makeRequest(`${this.betaApiVersion}/sessions/${formattedId}/analyze`);
    }, `getSessionSummary(${userId}, ${sessionId})`, null);
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

module.exports = fullstoryConnector;