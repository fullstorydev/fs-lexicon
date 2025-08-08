/**
 * Unit tests for ConnectorBase class
 */

// Mock modules for ESM
const mockRegisterComponent = jest.fn();
const mockRegisterConnector = jest.fn(); 
const mockMarkInitialized = jest.fn();
const mockMarkFailed = jest.fn();

jest.mock('../../initialization.js', () => ({
  default: {
    registerComponent: mockRegisterComponent,
    registerConnector: mockRegisterConnector,
    markInitialized: mockMarkInitialized,
    markFailed: mockMarkFailed
  }
}));

jest.mock('../../serviceRegistry.js', () => ({
  default: {
    get: jest.fn().mockImplementation(() => ({
      registerComponent: mockRegisterComponent,
      registerConnector: mockRegisterConnector,
      markInitialized: mockMarkInitialized,
      markFailed: mockMarkFailed
    })),
    has: jest.fn().mockReturnValue(true),
    register: jest.fn()
  }
}));

jest.mock('../../loggerFramework.js', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    refreshLogLevel: jest.fn().mockReturnValue(3)
  }))
}));

jest.mock('../../errorHandler.js', () => ({
  createErrorHandler: jest.fn().mockImplementation(() => ({
    handleError: jest.fn(),
    logError: jest.fn()
  }))
}));

jest.mock('../../connectorConfigValidator.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    validateConnection: jest.fn(),
    validateConfig: jest.fn(),
    checkIsConfigured: jest.fn().mockReturnValue(true)
  }))
}));

import ConnectorBase from '../../connectorBase.js';
import { Logger } from '../../loggerFramework.js';
import { createErrorHandler } from '../../errorHandler.js';
import ConnectorConfigValidator from '../../connectorConfigValidator.js';

describe('ConnectorBase', () => {
  let connector;
  
  beforeEach(() => {
    jest.clearAllMocks();
    connector = new ConnectorBase('TestConnector');
  });
  
  describe('constructor', () => {
    it('should initialize with the provided name', () => {
      expect(connector.name).toBe('TestConnector');
      expect(Logger).toHaveBeenCalledWith('Connector:TestConnector');
      expect(createErrorHandler).toHaveBeenCalledWith('Connector:TestConnector');
      expect(ConnectorConfigValidator).toHaveBeenCalledWith('TestConnector', expect.anything());
      expect(connector.initialized).toBe(false);
      expect(mockRegisterComponent).toHaveBeenCalledWith('TestConnector');
    });
    
    it('should handle initialization registration errors', () => {
      mockRegisterComponent.mockImplementationOnce(() => {
        throw new Error('Registration error');
      });
      
      const connector = new ConnectorBase('ErrorConnector');
      
      expect(connector.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not register connector'));
    });
    
    it('should accept custom initialization option', () => {
      const customInit = {
        registerComponent: jest.fn(),
        registerConnector: jest.fn(),
        markInitialized: jest.fn(),
        markFailed: jest.fn()
      };
      
      const connector = new ConnectorBase('CustomInitConnector', {
        initialization: customInit
      });
      
      expect(connector.initialization).toBe(customInit);
      expect(customInit.registerComponent).toHaveBeenCalledWith('CustomInitConnector');
    });
    
    it('should handle case when serviceRegistry does not have initialization', () => {
      // Mock the serviceRegistry to not have initialization service
      serviceRegistry.has.mockReturnValueOnce(false);
      // Mock an error to be thrown when trying to access the service
      serviceRegistry.get.mockImplementationOnce(() => {
        throw new Error('Service not registered');
      });
      
      // Create a mock logger for this test only
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        refreshLogLevel: jest.fn().mockReturnValue(3)
      };
      
      // Override the Logger mock for this test only
      Logger.mockImplementationOnce(() => mockLogger);
      
      const connector = new ConnectorBase('NoInitConnector');
      
      // The connector implementation now sets initialization to null
      expect(connector.initialization).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Initialization service not available yet'));
    });
  });
  
  describe('initialize', () => {
    it('should initialize the connector successfully', async () => {
      // Mock the _initializeConnector implementation
      connector._initializeConnector = jest.fn().mockResolvedValue({ status: 'success' });
      
      const result = await connector.initialize();
      
      expect(result).toBe(true);
      expect(connector.initialized).toBe(true);
      expect(mockRegisterConnector).toHaveBeenCalledWith('TestConnector');
      expect(connector._initializeConnector).toHaveBeenCalled();
      expect(mockMarkInitialized).toHaveBeenCalledWith('TestConnector', { status: 'success' });
    });
    
    it('should handle initialization errors', async () => {
      const error = new Error('Init error');
      connector._initializeConnector = jest.fn().mockRejectedValue(error);
      
      const result = await connector.initialize();
      
      expect(result).toBe(false);
      expect(connector.initialized).toBe(false);
      expect(mockMarkFailed).toHaveBeenCalledWith('TestConnector', error);
    });
    
    it('should handle case when _initializeConnector returns falsy value', async () => {
      connector._initializeConnector = jest.fn().mockResolvedValue(null);
      
      const result = await connector.initialize();
      
      expect(result).toBe(true);
      expect(mockMarkInitialized).toHaveBeenCalledWith('TestConnector', {});
    });
    
    it('should initialize without initialization service', async () => {
      // Create a mock local fallback
      const localFallback = {
        registerConnector: jest.fn(),
        markInitialized: jest.fn()
      };
      
      // Replace the initialization with our local fallback
      connector.initialization = localFallback;
      
      // Mock the _initializeConnector implementation
      connector._initializeConnector = jest.fn().mockResolvedValue({ status: 'locally_initialized' });
      
      const result = await connector.initialize();
      
      expect(result).toBe(true);
      expect(connector.initialized).toBe(true);
      expect(localFallback.registerConnector).toHaveBeenCalledWith('TestConnector');
      expect(connector._initializeConnector).toHaveBeenCalled();
      expect(localFallback.markInitialized).toHaveBeenCalledWith('TestConnector', { status: 'locally_initialized' });
    });
  });
  
  describe('checkInitialized', () => {
    it('should return initialization status when not throwing errors', () => {
      connector.initialized = false;
      expect(connector.checkInitialized()).toBe(false);
      
      connector.initialized = true;
      expect(connector.checkInitialized()).toBe(true);
    });
    
    it('should throw error when not initialized and throwError is true', () => {
      connector.initialized = false;
      
      expect(() => {
        connector.checkInitialized(true);
      }).toThrow('Connector TestConnector is not initialized');
      
      expect(connector.logger.error).toHaveBeenCalled();
    });
    
    it('should not throw error when initialized and throwError is true', () => {
      connector.initialized = true;
      
      expect(() => {
        connector.checkInitialized(true);
      }).not.toThrow();
    });
  });
  
  describe('safeExecute', () => {
    it('should execute function and return result when initialized', async () => {
      connector.initialized = true;
      const mockFn = jest.fn().mockResolvedValue('success result');
      
      const result = await connector.safeExecute(mockFn, 'test operation');
      
      expect(result).toBe('success result');
      expect(mockFn).toHaveBeenCalled();
    });
    
    it('should throw error when not initialized', async () => {
      connector.initialized = false;
      const mockFn = jest.fn();
      
      const result = await connector.safeExecute(mockFn, 'test operation', 'default value');
      
      expect(result).toBe('default value');
      expect(mockFn).not.toHaveBeenCalled();
      expect(connector.logger.error).toHaveBeenCalled();
    });
    
    it('should handle function execution errors', async () => {
      connector.initialized = true;
      const error = new Error('Execution error');
      const mockFn = jest.fn().mockRejectedValue(error);
      
      const result = await connector.safeExecute(mockFn, 'error operation', 'error default');
      
      expect(result).toBe('error default');
      expect(connector.logger.error).toHaveBeenCalledWith('Error during error operation', error);
    });
  });
});