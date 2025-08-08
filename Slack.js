/**
 * SlackConnector - Connector for Slack webhook notifications
 * Provides methods for sending notifications to different Slack channels
 */
import ConnectorBase from './connectorBase.js';
import serviceRegistry from './serviceRegistry.js';

/**
 * Slack connector class
 */
class SlackConnector extends ConnectorBase {
  /**
   * Initialize the Slack connector
   * @param {Object} options - Configuration options
   * @param {number} [options.maxRetries=3] - Maximum number of retry attempts
   * @param {number} [options.retryDelay=1000] - Delay between retries in milliseconds
   * @param {number} [options.rateLimit=1] - Maximum requests per second
   */
  constructor(options = {}) {
    // Call parent constructor with the connector name
    super('Slack');
    
    // Use ConnectorBase methods to get config values through the validator
    this.webhookUrl = this.getConfig('slack_webhook_url');
    this.aiWebhookUrl = this.getConfig('slack_ai_webhook_url');
    
    // Check if configuration is valid
    this.isConfigured = this.webhookUrl ? true : false;
    
    // Retry and rate limiting configuration
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.rateLimit = options.rateLimit || 1; // requests per second
    this.requestQueue = [];
    this.isProcessingQueue = false;
    
    // Track rate limiting
    this.lastRequestTime = 0;
  }
  
  /**
   * Connector-specific initialization logic
   * @returns {Promise<Object>} Initialization result details
   * @protected
   */
  async _initializeConnector() {
    return {
      status: this.isConfigured ? 'configured' : 'not_configured',
      hasAIWebhook: !!this.aiWebhookUrl
    };
  }

  /**
   * Send data to a Slack webhook URL with retry logic
   * @param {string} webhookUrl - Target webhook URL
   * @param {Object} data - Data to send
   * @returns {Promise<Object>} Response from Slack API
   * @private
   */
  async _sendToWebhook(webhookUrl, data) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        webhookUrl,
        data,
        resolve,
        reject,
        retries: 0
      });
      
      this._processQueue();
    });
  }
  
  /**
   * Process the request queue with rate limiting
   * @private
   */
  async _processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    try {
      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const minRequestInterval = 1000 / this.rateLimit;
      
      if (timeSinceLastRequest < minRequestInterval) {
        await new Promise(resolve => setTimeout(resolve, minRequestInterval - timeSinceLastRequest));
      }
      
      const request = this.requestQueue.shift();
      this.lastRequestTime = Date.now();
      
      try {
        if (!request.webhookUrl) {
          throw new Error('Slack webhook URL not configured');
        }
        
        this.logger.debug('Sending message to Slack', { 
          urlLength: request.webhookUrl.length,
          dataKeys: Object.keys(request.data) 
        });
        
        const response = await fetch(request.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(request.data)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`Slack API error: ${response.status} - ${errorText}`);
          error.status = response.status;
          throw error;
        }
        
        // Slack webhooks return "ok" as text, not JSON
        const responseText = await response.text();
        request.resolve({ ok: responseText === 'ok' });
      } catch (error) {
        if (request.retries < this.maxRetries && 
            (error.status === 429 || error.status >= 500)) {
          // Retry on rate limiting (429) or server errors (5xx)
          this.logger.warn(`Retrying Slack webhook (${request.retries + 1}/${this.maxRetries}): ${error.message}`);
          this.requestQueue.unshift({
            ...request,
            retries: request.retries + 1
          });
          
          // Add exponential backoff for retries
          const backoff = this.retryDelay * Math.pow(2, request.retries);
          await new Promise(resolve => setTimeout(resolve, backoff));
        } else {
          this.logger.error('Error sending to Slack webhook:', error);
          request.reject(error);
        }
      }
    } finally {
      this.isProcessingQueue = false;
      if (this.requestQueue.length > 0) {
        this._processQueue();
      }
    }
  }
  
  /**
   * Send notification to the standard Slack webhook
   * @param {Object} data - Data to send to Slack
   * @param {Object} [options] - Optional parameters
   * @param {boolean} [options.ignoreErrors=false] - Whether to ignore errors
   * @returns {Promise<Object>} Response from Slack API
   */
  async sendWebHook(data, options = {}) {
    return this.safeExecute(async () => {
      if (!this.isConfigured) {
        this.logger.warn('Slack message not sent - connector not configured');
        return { ok: false, error: 'Connector not configured' };
      }
      
      this.logger.info('Sending data to standard Slack webhook');
      return await this._sendToWebhook(this.webhookUrl, data);
    }, 'sendWebHook', { ok: false, error: 'Operation failed' });
  }
  
  /**
   * Send notification to the AI-specific webhook
   * The AI webhook expects different fields in the request body
   * @param {Object} data - Data to send to Slack
   * @param {Object} [options] - Optional parameters
   * @param {boolean} [options.ignoreErrors=false] - Whether to ignore errors
   * @returns {Promise<Object>} Response from Slack API
   */
  async sendAIWebHook(data, options = {}) {
    return this.safeExecute(async () => {
      if (!this.isConfigured) {
        this.logger.warn('AI Slack message not sent - connector not configured');
        return { ok: false, error: 'Connector not configured' };
      }
      
      const url = this.aiWebhookUrl || this.webhookUrl;
      
      if (!url) {
        this.logger.error('No webhook URL provided for AI webhook');
        return { ok: false, error: 'No webhook URL configured' };
      }
      
      this.logger.info('Sending data to AI Slack webhook');
      return await this._sendToWebhook(url, data);
    }, 'sendAIWebHook', { ok: false, error: 'Operation failed' });
  }
}

// Create a singleton instance
const slackConnector = new SlackConnector();

// Initialize the connector - ConnectorBase now handles initialization tracking through the service registry
slackConnector.initialize()
  .catch(error => {
    console.error('Error initializing Slack connector:', error);
  });

// Register in the service registry
serviceRegistry.register('slack', slackConnector);

// Export individual methods for backward compatibility
const slackExports = {
  sendWebHook: slackConnector.sendWebHook.bind(slackConnector),
  sendAIWebHook: slackConnector.sendAIWebHook.bind(slackConnector),
  client: slackConnector,
  SlackConnector
};

export default slackExports;
export { slackConnector as client, SlackConnector };