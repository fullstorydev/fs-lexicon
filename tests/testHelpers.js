/**
 * Test helpers for Lexicon test suite
 * 
 * Common utilities, mocks, and test data factories
 */

/**
 * Creates a mock Express request object
 * @param {Object} options - Request configuration options
 * @returns {Object} A mock Express request object
 */
function createMockRequest(options = {}) {
  const {
    method = 'POST',
    path = '/webhook/test',
    headers = {},
    body = {},
    query = {},
    params = {}
  } = options;
  
  return {
    method,
    path,
    originalUrl: path,
    url: path,
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Jest Test Agent',
      ...headers
    },
    body,
    query,
    params,
    ip: '127.0.0.1',
    get: (name) => headers[name.toLowerCase()]
  };
}

/**
 * Creates a mock Express response object with Jest spies
 * @returns {Object} A mock Express response object
 */
function createMockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    getHeader: jest.fn(),
    headersSent: false,
    locals: {}
  };
  return res;
}

/**
 * Creates test webhook event data
 * @param {Object} overrides - Data to override defaults with
 * @returns {Object} Webhook event data
 */
function createTestEventData(overrides = {}) {
  const now = new Date().toISOString();
  
  return {
    user: {
      id: 'test-user-123',
      email: 'test@example.com',
      display_name: 'Test User'
    },
    event_name: 'test_event',
    timestamp: now,
    session_id: 'test-session-456',
    ...overrides
  };
}

/**
 * Creates a full test webhook payload
 * @param {String} eventType - Type of event (e.g. 'slack', 'fusion')
 * @param {Object} overrides - Data to override defaults with
 * @returns {Object} Complete webhook payload
 */
function createWebhookPayload(eventType = 'generic', overrides = {}) {
  const baseEvent = createTestEventData();
  
  const templates = {
    slack: {
      ...baseEvent
    },
    fusion: {
      ...baseEvent,
      properties: {
        clicked_element: 'submit-button',
        page_url: 'https://example.com/checkout',
        page_title: 'Checkout Page'
      }
    },
    googlesheets: {
      ...baseEvent,
      form_data: {
        field1: 'value1',
        field2: 'value2'
      }
    },
    jira: {
      ...baseEvent,
      priority: 'high',
      description: 'Test issue description'
    },
    snowflake: {
      ...baseEvent,
      data: {
        table: 'STOCK_MANAGEMENT',
        columns: ['product_id', 'quantity'],
        values: ['product-123', 15]
      }
    },
    bigquery: {
      ...baseEvent,
      data: {
        table: 'fs_data_destinations.lead_info',
        row: {
          lead_id: 'lead-123',
          source: 'website',
          score: 85
        }
      }
    }
  };
  
  return {
    ...(templates[eventType] || templates.generic),
    ...overrides
  };
}

/**
 * Waits for a specified number of milliseconds
 * @param {Number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after the wait time
 */
function wait(ms = 100) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  createMockRequest,
  createMockResponse,
  createTestEventData,
  createWebhookPayload,
  wait
};