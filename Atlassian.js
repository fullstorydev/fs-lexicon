/**
 * Atlassian integration connector for Lexicon
 * Handles interactions with Jira
 */
import fetch from 'node-fetch';
import ConnectorBase from './connectorBase.js';
import serviceRegistry from './serviceRegistry.js';

class AtlassianConnector extends ConnectorBase {
    constructor() {
      // Call parent constructor with the connector name
      super('Atlassian');
      
      // Use the ConnectorBase validation methods
      this.jira_base_url = this.getConfig('jira_base_url', 'https://your-domain.atlassian.net');
      this.jira_api_token = this.getConfig('jira_api_token');
      this.jira_username = this.getConfig('jira_username');
      this.jira_issue_type_id = this.getConfig('jira_issue_type_id');

      // Check if configuration is valid
      this.isConfigured = this.validator.checkIsConfigured();

      // Create auth header if credentials are available
      if (this.isConfigured) {
        this.authHeader = `Basic ${Buffer.from(
          `${this.jira_username}:${this.jira_api_token}`
        ).toString('base64')}`;
      }
    }

  /**
   * Connector-specific initialization logic
   * @returns {Promise<Object>} Initialization result details
   * @protected
   */
  async _initializeConnector() {
    return {
      status: this.isConfigured ? 'configured' : 'not_configured',
      jira_configured: this.isConfigured
    };
  }

  /**
   * Create a Jira ticket
   * @param {Object} ticketData - The ticket data to be sent to Jira
   * @returns {Promise<Object>} - Jira ticket response
   */
  async createTicket(ticketData) {
    // Make sure we're initialized
    this.checkInitialized(true);
    
    if (!this.isConfigured) {
      this.logger.warn('Jira createTicket called but client is not properly configured');
      throw new Error('Jira client not properly configured');
    }
    
    if (!ticketData || !ticketData.fields) {
      throw new Error('Invalid ticket data');
    }

    try {
      const response = await fetch(`${this.jira_base_url}/rest/api/2/issue`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(ticketData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Jira API error: ${response.status} ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Error creating Jira ticket:', error);
      throw error;
    }
  }

  /**
   * Get a Jira ticket by ID
   * @param {string} ticketId - The Jira ticket ID
   * @returns {Promise<Object>} - Jira ticket data
   */
  async getTicket(ticketId) {
    return this.safeExecute(async () => {
      if (!this.isConfigured) {
        this.logger.warn('Jira getTicket called but client is not properly configured');
        throw new Error('Jira client not properly configured');
      }

      const response = await fetch(`${this.jira_base_url}/rest/api/2/issue/${ticketId}`, {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Jira API error: ${response.status} ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    }, `getTicket(${ticketId})`, null);
  }
  
  /**
   * Add a comment to a Jira ticket
   * @param {string} ticketId - The Jira ticket ID
   * @param {string} comment - The comment text (can be markdown)
   * @returns {Promise<Object>} - Comment response
   */
  async addComment(ticketId, comment) {
    return this.safeExecute(async () => {
      if (!this.isConfigured) {
        this.logger.warn('Jira addComment called but client is not properly configured');
        throw new Error('Jira client not properly configured');
      }

      const response = await fetch(`${this.jira_base_url}/rest/api/2/issue/${ticketId}/comment`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          body: comment
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Jira API error: ${response.status} ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    }, `addComment(${ticketId})`, null);
  }

  /**
   * Update a Jira ticket
   * @param {string} ticketId - The Jira ticket ID
   * @param {Object} updateData - The data to update
   * @returns {Promise<Object>} - Update response
   */
  async updateTicket(ticketId, updateData) {
    return this.safeExecute(async () => {
      if (!this.isConfigured) {
        this.logger.warn('Jira updateTicket called but client is not properly configured');
        throw new Error('Jira client not properly configured');
      }

      const response = await fetch(`${this.jira_base_url}/rest/api/2/issue/${ticketId}`, {
        method: 'PUT',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Jira API error: ${response.status} ${JSON.stringify(errorData)}`);
      }

      return { success: true, ticketId };
    }, `updateTicket(${ticketId})`, null);
  }
}

// Create a singleton instance
const atlassianConnector = new AtlassianConnector();

// Initialize the connector - ConnectorBase now handles initialization tracking through the service registry
atlassianConnector.initialize()
  .catch(error => {
    console.error('Error initializing Atlassian connector:', error);
  });

// Register in the service registry
serviceRegistry.register('atlassian', atlassianConnector);

// Export the connector
export default { jira: atlassianConnector };
export { atlassianConnector as jira };