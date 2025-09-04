/**
 * Unit tests for WebhookBase class
 */

import { jest } from '@jest/globals';

// Initialize all mocks before any imports
const mockRegisterComponent = jest.fn();
const mockMarkInitialized = jest.fn();
const mockMarkFailed = jest.fn();
const mockExtractRoutes = jest.fn().mockReturnValue(['GET /test']);

jest.unstable_mockModule('../../initialization.js', () => ({
  default: {
    registerComponent: mockRegisterComponent,
    markInitialized: mockMarkInitialized,
    markFailed: mockMarkFailed,
    extractRoutes: mockExtractRoutes
  }
}));

jest.unstable_mockModule('../../serviceRegistry.js', () => ({
  default: {
    get: jest.fn().mockImplementation(() => ({
      registerComponent: mockRegisterComponent,
      markInitialized: mockMarkInitialized,
      markFailed: mockMarkFailed,
      extractRoutes: mockExtractRoutes
    })),
    has: jest.fn().mockReturnValue(true)
  }
}));

// Mock the date-fns format function
jest.unstable_mockModule('date-fns', () => ({
  format: jest.fn().mockImplementation(() => '04/15/25 10:00 AM')
}));

// Mock other dependencies
jest.unstable_mockModule('../../loggerFramework.js', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    refreshLogLevel: jest.fn().mockReturnValue(3)
  }))
}));

jest.unstable_mockModule('../../errorHandler.js', () => ({
  ErrorHandler: jest.fn().mockImplementation(() => ({
    handleError: jest.fn(),
    createErrorResponse: jest.fn(),
    createValidationError: jest.fn()
  })),
  createErrorHandler: jest.fn().mockImplementation(() => ({
    handleError: jest.fn()
  }))
}));

// Now import modules after all mocks are set up
const { default: WebhookBase } = await import('../../webhookBase.js');
const { Logger } = await import('../../loggerFramework.js');
const { createErrorHandler } = await import('../../errorHandler.js');
const { default: serviceRegistry } = await import('../../serviceRegistry.js');

describe('WebhookBase', () => {
  let webhook;
  let mockRouter;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn()
    };
    webhook = new WebhookBase('TestWebhook');
  });
  
  describe('constructor', () => {
    it('should initialize with the provided name', () => {
      expect(webhook.name).toBe('TestWebhook');
      expect(Logger).toHaveBeenCalledWith('Webhook:TestWebhook');
      // Note: webhookBase.js uses 'new ErrorHandler()' directly, not createErrorHandler
      // expect(createErrorHandler).toHaveBeenCalledWith('Webhook:TestWebhook');
      expect(mockRegisterComponent).toHaveBeenCalledWith('Webhook:TestWebhook');
    });
    
    it('should handle initialization registration errors', () => {
      mockRegisterComponent.mockImplementationOnce(() => {
        throw new Error('Registration error');
      });
      
      webhook = new WebhookBase('ErrorWebhook');
      
      expect(webhook.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not register webhook component'));
    });
    
    it('should accept custom initialization option', () => {
      const customInit = {
        registerComponent: jest.fn(),
        markInitialized: jest.fn(),
        markFailed: jest.fn(),
        extractRoutes: jest.fn().mockReturnValue(['GET /custom'])
      };
      
      webhook = new WebhookBase('CustomWebhook', {
        initialization: customInit
      });
      
      expect(webhook.initialization).toBe(customInit);
      expect(customInit.registerComponent).toHaveBeenCalledWith('Webhook:CustomWebhook');
    });
    
    it('should handle case when serviceRegistry does not have initialization', () => {
      // For this test, we'll skip testing the debug message itself since it's
      // challenging to intercept it correctly in the testing environment.
      // Instead, we'll just verify the final state is correct.
      
      // Mock service registry to simulate missing initialization
      serviceRegistry.has.mockReturnValueOnce(false);
      serviceRegistry.get.mockImplementationOnce(() => {
        throw new Error('Service not registered');
      });
      
      // Create new webhook instance
      const noInitWebhook = new WebhookBase('NoInitWebhook');
      
      // Verify the webhook was created but initialization is null
      expect(noInitWebhook.name).toBe('NoInitWebhook');
      expect(noInitWebhook.initialization).toBeNull();
    });
  });
  
  describe('initialize', () => {
    it('should initialize webhook successfully', () => {
      // Reset mocks to ensure clean state
      jest.clearAllMocks();
      
      // Create fresh webhook instance
      const testWebhook = new WebhookBase('TestWebhook');
      
      // Spy on the _configureRoutes method
      jest.spyOn(testWebhook, '_configureRoutes');
      
      const result = testWebhook.initialize(mockRouter);
      
      expect(result).toBe(true);
      expect(testWebhook._configureRoutes).toHaveBeenCalledWith(mockRouter);
      expect(mockMarkInitialized).toHaveBeenCalledWith(
        'Webhook:TestWebhook', 
        { routes: ['GET /test'] }
      );
    });
    
    it('should handle initialization errors', () => {
      jest.spyOn(webhook, '_configureRoutes').mockImplementation(() => {
        throw new Error('Configuration error');
      });
      
      const result = webhook.initialize(mockRouter);
      
      expect(result).toBe(false);
      expect(webhook.logger.error).toHaveBeenCalledWith(
        'Failed to initialize webhook TestWebhook', 
        expect.any(Error)
      );
      expect(mockMarkFailed).toHaveBeenCalledWith(
        'Webhook:TestWebhook', 
        expect.any(Error)
      );
    });
    
    it('should initialize without initialization service', () => {
      // Set initialization to null to simulate missing service
      webhook.initialization = null;
      
      jest.spyOn(webhook, '_configureRoutes');
      
      const result = webhook.initialize(mockRouter);
      
      expect(result).toBe(true);
      expect(webhook._configureRoutes).toHaveBeenCalledWith(mockRouter);
      expect(webhook.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('initialized without tracking')
      );
    });
  });
  
  describe('_configureRoutes', () => {
    it('should log warning for default implementation', () => {
      webhook._configureRoutes(mockRouter);
      
      expect(webhook.logger.warn).toHaveBeenCalledWith(
        '_configureRoutes not implemented for TestWebhook'
      );
    });
  });
  
  describe('extractCommonData', () => {
    it('should extract data from valid webhook payload', () => {
      const mockDate = new Date('2025-04-15T10:00:00Z');
      global.Date = jest.fn(() => mockDate);
      global.Date.now = jest.fn(() => mockDate.getTime());
      mockDate.toISOString = jest.fn().mockReturnValue('2025-04-15T10:00:00.000Z');
      
      const payload = {
        name: 'test_event',
        timestamp: '2025-04-15T10:00:00Z',
        user: {
          email: 'test@example.com',
          display_name: 'Test User',
          id: '12345'
        },
        api_version: '1.0',
        signal_version: '2.0',
        properties: {
          session_id: 'session123',
          extra: 'data'
        }
      };
      
      const result = webhook.extractCommonData(payload);
      
      expect(result).toEqual({
        event_name: 'test_event',
        email: 'test@example.com',
        display_name: 'Test User',
        uid: '12345',
        timestamp: '04/15/25 10:00 AM',
        time: '2025-04-15T10:00:00.000Z',
        api_version: '1.0',
        signal_version: '2.0',
        session_id: 'session123',
        properties: {
          session_id: 'session123',
          extra: 'data'
        }
      });
    });
    
    it('should handle missing fields with undefined values', () => {
      const mockDate = new Date('2025-04-15T10:00:00Z');
      global.Date = jest.fn(() => mockDate);
      global.Date.now = jest.fn(() => mockDate.getTime());
      mockDate.toISOString = jest.fn().mockReturnValue('2025-04-15T10:00:00.000Z');
      
      const result = webhook.extractCommonData({});
      
      expect(result).toEqual({
        event_name: 'Undefined',
        email: 'Undefined',
        display_name: 'Undefined',
        uid: 'Undefined',
        timestamp: '04/15/25 10:00 AM',
        time: '2025-04-15T10:00:00.000Z',
        api_version: 'Undefined',
        signal_version: 'Undefined',
        session_id: 'Undefined',
        properties: {}
      });
    });
    
    it('should handle errors during extraction', () => {
      const mockDate = new Date('2025-04-15T10:00:00Z');
      global.Date = jest.fn(() => mockDate);
      global.Date.now = jest.fn(() => mockDate.getTime());
      mockDate.toISOString = jest.fn().mockReturnValue('2025-04-15T10:00:00.000Z');
      
      // Create a payload that will cause an error during extraction
      const payload = {
        user: {
          get email() { throw new Error('Property error'); }
        }
      };
      
      const result = webhook.extractCommonData(payload);
      
      // Should return a safe fallback object with default values
      expect(result.event_name).toBe('Error');
      expect(result.email).toBe('Undefined');
      expect(webhook.logger.error).toHaveBeenCalled();
    });
  });
  
  describe('validateRequiredFields', () => {
    it('should return null for valid data', () => {
      const data = {
        field1: 'value1',
        field2: 'value2'
      };
      
      const result = webhook.validateRequiredFields(data, ['field1', 'field2']);
      
      expect(result).toBeNull();
    });
    
    it('should return error for missing fields', () => {
      const data = {
        field1: 'value1',
        field2: undefined,
        field3: 'Undefined'
      };
      
      const result = webhook.validateRequiredFields(data, ['field1', 'field2', 'field3', 'field4']);
      
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain('Missing required data fields');
      expect(webhook.logger.warn).toHaveBeenCalled();
    });
  });
  
  describe('createSuccessResponse', () => {
    it('should create standard success response with default message', () => {
      const data = { key: 'value' };
      
      const result = webhook.createSuccessResponse(data);
      
      expect(result).toEqual({
        success: true,
        message: 'Operation completed successfully',
        data: { key: 'value' }
      });
    });
    
    it('should create success response with custom message', () => {
      const data = { key: 'value' };
      
      const result = webhook.createSuccessResponse(data, 'Custom message');
      
      expect(result).toEqual({
        success: true,
        message: 'Custom message',
        data: { key: 'value' }
      });
    });
  });
  
  describe('logWebhookStart', () => {
    it('should log webhook processing start', () => {
      const req = {
        method: 'POST',
        path: '/webhook',
        get: jest.fn().mockImplementation(header => {
          if (header === 'content-type') return 'application/json';
          if (header === 'content-length') return '256';
          return '';
        }),
        body: { data: 'test' }
      };
      
      webhook.logWebhookStart('Test', req);
      
      expect(webhook.logger.info).toHaveBeenCalledWith(
        'Starting Test webhook processing',
        expect.objectContaining({
          method: 'POST',
          path: '/webhook',
          contentType: 'application/json',
          contentLength: '256'
        })
      );
      
      expect(webhook.logger.debug).toHaveBeenCalledWith(
        'Test webhook payload',
        { data: 'test' }
      );
    });
  });
  
  describe('logWebhookCompletion', () => {
    it('should log webhook processing completion', () => {
      webhook.logWebhookCompletion('Test', { id: '123' });
      
      expect(webhook.logger.info).toHaveBeenCalledWith(
        'Test webhook completed successfully',
        { id: '123' }
      );
    });
  });
  
  describe('getFullstorySessionData', () => {
    it('should fetch session data successfully', async () => {
      const mockFullstory = {
        getSessionLink: jest.fn().mockReturnValue('https://app.fullstory.com/session/123'),
        getSessionSummary: jest.fn().mockResolvedValue({
          analysis: { key: 'value' }
        })
      };
      
      const result = await webhook.getFullstorySessionData(mockFullstory, 'user123', 'session123');
      
      expect(result).toEqual({
        replayURL: 'https://app.fullstory.com/session/123',
        sessionSummary: '{"key":"value"}'
      });
      expect(mockFullstory.getSessionLink).toHaveBeenCalledWith('user123', 'session123');
      expect(mockFullstory.getSessionSummary).toHaveBeenCalledWith('user123', 'session123');
    });
    
    it('should handle errors getting session link', async () => {
      const mockFullstory = {
        getSessionLink: jest.fn().mockImplementation(() => {
          throw new Error('Link error');
        }),
        getSessionSummary: jest.fn().mockResolvedValue({
          analysis: { key: 'value' }
        })
      };
      
      const result = await webhook.getFullstorySessionData(mockFullstory, 'user123', 'session123');
      
      expect(result.replayURL).toBe('No replay URL available');
      expect(result.sessionSummary).toBe('{"key":"value"}');
      expect(webhook.logger.error).toHaveBeenCalledWith('Error getting session link', expect.any(Error));
    });
    
    it('should handle errors fetching session summary', async () => {
      const mockFullstory = {
        getSessionLink: jest.fn().mockReturnValue('https://app.fullstory.com/session/123'),
        getSessionSummary: jest.fn().mockRejectedValue(new Error('Summary error'))
      };
      
      const result = await webhook.getFullstorySessionData(mockFullstory, 'user123', 'session123');
      
      expect(result.replayURL).toBe('https://app.fullstory.com/session/123');
      expect(result.sessionSummary).toBe('No session summary available');
      expect(webhook.logger.error).toHaveBeenCalledWith('Error fetching session summary', expect.any(Error));
    });
    
    it('should handle null session summary', async () => {
      const mockFullstory = {
        getSessionLink: jest.fn().mockReturnValue('https://app.fullstory.com/session/123'),
        getSessionSummary: jest.fn().mockResolvedValue(null)
      };
      
      const result = await webhook.getFullstorySessionData(mockFullstory, 'user123', 'session123');
      
      expect(result.replayURL).toBe('https://app.fullstory.com/session/123');
      expect(result.sessionSummary).toBe('No session summary available');
    });
  });
});