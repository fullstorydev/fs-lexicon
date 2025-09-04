/**
 * Configuration management for Lexicon
 * Handles environment variables, validation and provides typed access
 */
import 'dotenv/config';
import { Logger } from './loggerFramework.js';

class Configuration {
  constructor() {
    // Set up logger before loading config so we can log during initialization
    this.logger = new Logger('Config');
    
    this.config = this._loadConfiguration();
    this._validateRequiredConfig();
    
    // After configuration is loaded, we can update the logger with our config
    this.logger.refreshLogLevel(this);
    
    this.logger.info('Configuration loaded successfully', {
      environment: this.config.node_env,
      cloudProvider: this.config.cloud_provider
    });
  }

  /**
   * Load configuration from environment variables
   */
  _loadConfiguration() {
    // Auto-detect cloud environments and set to production
    // if not explicitly set by the user
    const isCloudEnvironment = this._isRunningInCloud();
    const nodeEnv = process.env.NODE_ENV || (isCloudEnvironment ? 'production' : 'development');
    
    this.logger.debug(`Detected environment: ${nodeEnv}, cloud environment: ${isCloudEnvironment}`);
    
    // Base configuration shared across all environments
    const baseConfig = {
      // Core settings
      node_env: nodeEnv,
      cloud_provider: (process.env.CLOUD_PROVIDER || 'GCP').toUpperCase(),
      port: process.env.PORT || 8080,
      debug_patterns: process.env.DEBUG || 'lexicon:*',
      log_level: process.env.LOG_LEVEL,
      
      // API Keys and Authentication
      fs_org_api_key: process.env.ORG_API_KEY,
      fullstory_token: process.env.FS_PROD_API_KEY,
      fullstory_org_id: process.env.FS_ORG_ID,
      fullstory_dc: process.env.FS_DC,
      
      // Webhook Endpoints
      slack_webhook_url: process.env.SLACK_WEBHOOK_URL,
      slack_ai_webhook_url: process.env.SLACK_AI_WEBHOOK_URL,
      
      // Jira Configuration
      jira_base_url: process.env.JIRA_BASE_URL,
      jira_api_token: process.env.JIRA_API_TOKEN_2,
      jira_username: process.env.JIRA_USERNAME,
      jira_project_id: process.env.JIRA_PROJECT_ID,
      jira_issue_type_id: process.env.JIRA_ISSUE_TYPE_ID,
      jira_session_field_id: process.env.JIRA_SESSION_FIELD_ID || 'customfield_XXXXX',
      
      // Snowflake Configuration
      snowflake_account_identifier: process.env.SNOWFLAKE_ACCOUNT_IDENTIFIER,
      snowflake_user: process.env.SNOWFLAKE_USER,
      snowflake_warehouse: process.env.SNOWFLAKE_WAREHOUSE,
      snowflake_database: process.env.SNOWFLAKE_DATABASE,
      snowflake_schema: process.env.SNOWFLAKE_SCHEMA,
      snowflake_private_key: process.env.SNOWFLAKE_PRIVATE_KEY,
      snowflake_private_key_passphrase: process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE,
      
      // Google Cloud Configuration
      google_project_id: process.env.GOOGLE_PROJECT_ID,
      google_workspace_keyfile: process.env.GOOGLE_WORKSPACE_KEY_FILE,
      google_sheets_id: process.env.GOOGLE_WORKSPACE_SHEET_ID,
      google_sheets_range: process.env.GOOGLE_SHEETS_RANGE || 'Sheet1',
      bigquery_keyfile: process.env.BIGQUERY_KEYFILE,
      
      // Rate Limiting Configuration
      rate_limit_enabled: process.env.RATE_LIMIT_ENABLED,
      rate_limit_window_ms: process.env.RATE_LIMIT_WINDOW_MS,
      rate_limit_max_requests: process.env.RATE_LIMIT_MAX_REQUESTS,
      rate_limit_api_window_ms: process.env.RATE_LIMIT_API_WINDOW_MS,
      rate_limit_api_max_requests: process.env.RATE_LIMIT_API_MAX_REQUESTS,
      rate_limit_webhook_window_ms: process.env.RATE_LIMIT_WEBHOOK_WINDOW_MS,
      rate_limit_webhook_max_requests: process.env.RATE_LIMIT_WEBHOOK_MAX_REQUESTS,
      rate_limit_mcp_window_ms: process.env.RATE_LIMIT_MCP_WINDOW_MS,
      rate_limit_mcp_max_requests: process.env.RATE_LIMIT_MCP_MAX_REQUESTS,
      rate_limit_tool_window_ms: process.env.RATE_LIMIT_TOOL_WINDOW_MS,
      rate_limit_tool_max_requests: process.env.RATE_LIMIT_TOOL_MAX_REQUESTS,
      rate_limit_use_redis: process.env.RATE_LIMIT_USE_REDIS,
      rate_limit_redis_url: process.env.RATE_LIMIT_REDIS_URL,
      
      // MCP Configuration
      mcp_mode: process.env.MCP_MODE,
      mcp_url: process.env.MCP_URL || 'http://localhost:8080/mcp',
      mcp_debug: process.env.MCP_DEBUG,
      lexicon_url: process.env.LEXICON_URL || 'http://localhost:8080',
      mcp_auth_enabled: process.env.MCP_AUTH_ENABLED,
      mcp_auth_server_url: process.env.MCP_AUTH_SERVER_URL,
      mcp_server_canonical_uri: process.env.MCP_SERVER_CANONICAL_URI,
      mcp_auth_client_id: process.env.MCP_AUTH_CLIENT_ID,
      mcp_auth_client_secret: process.env.MCP_AUTH_CLIENT_SECRET,
      mcp_auth_allow_dynamic_registration: process.env.MCP_AUTH_ALLOW_DYNAMIC_REGISTRATION,
      mcp_auth_token_cache_time: process.env.MCP_AUTH_TOKEN_CACHE_TIME,
      mcp_auth_require_audience_validation: process.env.MCP_AUTH_REQUIRE_AUDIENCE_VALIDATION,
      mcp_auth_max_token_age: process.env.MCP_AUTH_MAX_TOKEN_AGE,
      mcp_auth_rate_limit_by_token: process.env.MCP_AUTH_RATE_LIMIT_BY_TOKEN,
      
      // Test Configuration
      test_fullstory_user_id: process.env.TEST_FULLSTORY_USER_ID || 'demo_user_id',
      test_fullstory_session_id: process.env.TEST_FULLSTORY_SESSION_ID || 'demo_session_id',
      test_bigquery_project_id: process.env.TEST_BIGQUERY_PROJECT_ID || 'demo-project',
      test_bigquery_dataset: process.env.TEST_BIGQUERY_DATASET || 'demo_dataset',
      test_bigquery_table: process.env.TEST_BIGQUERY_TABLE || 'demo_table',
      skip_real_data_tests: process.env.SKIP_REAL_DATA_TESTS || 'true',
      
      // Security Settings
      safe_mode: process.env.SAFE_MODE || 'false'
    };
    
    // Environment-specific overrides
    const envSpecificConfig = this._getEnvironmentSpecificConfig(nodeEnv);
    
    // Cloud provider specific settings
    const providerConfig = this._getCloudProviderConfig(baseConfig.cloud_provider);
    
    
    return { ...baseConfig, ...envSpecificConfig, ...providerConfig };
  }
  
  /**
   * Get environment-specific configuration
   */
  _getEnvironmentSpecificConfig(nodeEnv) {
    switch (nodeEnv) {
      case 'production':
        return {
          log_level: 'info',
          enable_detailed_errors: false,
          skip_webhook_verification: false
        };
      case 'staging':
        return {
          log_level: 'debug',
          enable_detailed_errors: true,
          skip_webhook_verification: false
        };
      case 'development':
      default:
        return {
          log_level: 'debug',
          enable_detailed_errors: true,
          skip_webhook_verification: process.env.SKIP_WEBHOOK_VERIFICATION === 'true'
        };
    }
  }
  
  /**
   * Get cloud provider specific configuration
   */
  _getCloudProviderConfig(provider) {
    switch (provider) {
      case 'GCP':
        return {
          functions_timeout: process.env.functions_timeout || '60s',
          storage_bucket: process.env.storage_bucket || `${process.env.GOOGLE_PROJECT_ID}-assets`
        };
      case 'AZURE':
        return {
          functions_timeout: process.env.functions_timeout || '00:01:00',
          storage_container: process.env.storage_container || 'assets'
        };
      case 'AWS':
        return {
          functions_timeout: process.env.functions_timeout || 60,
          s3_bucket: process.env.s3_bucket || 'lexicon-assets'
        };
      default:
        return {};
    }
  }
  
  /**
   * Validate required configuration values
   * Throws error if required config is missing
   */
  _validateRequiredConfig() {
    const requiredConfigs = {
      all: ['cloud_provider'],
      
      // Core connector requirements
      // Amend as needed for your specific configuration
      connectors: {
        fullstory: ['fullstory_token', 'fullstory_org_id'],
        slack: ['slack_webhook_url'],
        jira: ['jira_base_url', 'jira_api_token', 'jira_issue_type_id'],
        snowflake: [
          'snowflake_account_identifier',
          'snowflake_user',
          'snowflake_warehouse',
          'snowflake_database'
        ],
        gcp: []
      },
      
      // Cloud provider specific requirements
      // Amend as needed for your specific configuration
      providers: {
        GCP: [],
        AZURE: [],
        AWS: []
      }
    };
    
    // Check common required configs
    this._validateConfigGroup(requiredConfigs.all);
    
    // Check cloud provider specific requirements
    if (this.config.cloud_provider) {
      this._validateConfigGroup(
        requiredConfigs.providers[this.config.cloud_provider] || []
      );
    }
    
    // Check connector-specific requirements if those connectors are being used
    Object.keys(requiredConfigs.connectors).forEach(connector => {
      if (this._isConnectorEnabled(connector)) {
        this._validateConfigGroup(requiredConfigs.connectors[connector]);
      }
    });
  }
  
  /**
   * Check if a connector is enabled based on configuration
   */
  _isConnectorEnabled(connector) {
    // Logic to determine if a connector is being used
    // Amend as needed for your specific configuration
    switch (connector) {
      case 'fullstory':
        return !!this.config.fullstory_token;
      case 'slack':
        return !!this.config.slack_webhook_url;
      case 'jira':
        return !!this.config.jira_base_url;
      case 'snowflake':
        return !!this.config.snowflake_account_identifier;
      case 'gcp':
        return this.config.cloud_provider === 'GCP';
      default:
        return false;
    }
  }
  
  /**
   * Validate a group of config values
   */
  _validateConfigGroup(configKeys) {
    const missing = configKeys.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      const missingKeys = missing.join(', ');
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(`Missing required configuration: ${missingKeys}`);
        throw new Error(`Missing required configuration: ${missingKeys}`);
      } else {
        this.logger.warn(`Warning: Missing recommended configuration: ${missingKeys}`);
      }
    }
  }
  
  /**
   * Get a configuration value with proper typing
   * @param {string} key - Configuration key
   * @param {any} defaultValue - Default value if key is not found
   * @returns {any} - The configuration value with proper type
   */
  get(key, defaultValue = undefined) {
    if (!(key in this.config) && defaultValue === undefined) {
      this.logger.warn(`Configuration key not found: ${key}`);
    }
    
    const value = key in this.config ? this.config[key] : defaultValue;
    
    // Handle boolean values stored as strings
    if (typeof defaultValue === 'boolean' && typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    
    // Handle numeric values stored as strings
    if (typeof defaultValue === 'number' && typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? defaultValue : parsed;
    }
    
    return value;
  }
  
  /**
   * Get a boolean configuration value
   */
  getBoolean(key, defaultValue = false) {
    const value = this.get(key, defaultValue);
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  }
  
  /**
   * Get a numeric configuration value
   */
  getNumber(key, defaultValue = 0) {
    const value = this.get(key, defaultValue);
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? defaultValue : parsed;
    }
    return typeof value === 'number' ? value : defaultValue;
  }
  
  /**
   * Get all configuration as an object
   * Useful for debugging
   */
  getAll() {
    return { ...this.config };
  }
  
  /**
   * Get a redacted config for logging (hides sensitive values)
   */
  getSafeConfig() {
    const sensitiveKeys = [
      'fs_org_api_key', 
      'fullstory_token', 
      'jira_api_token',
      'snowflake_private_key',
      'snowflake_private_key_passphrase',
      'google_workspace_keyfile',
      'bigquery_keyfile'
    ];
    
    const safeConfig = { ...this.config };
    
    sensitiveKeys.forEach(key => {
      if (key in safeConfig && safeConfig[key]) {
        safeConfig[key] = '[REDACTED]';
      }
    });
    
    return safeConfig;
  }
  
  /**
   * Determine if we're running in a FaaS environment
   */
  isFaaS() {
    return (
      // Google Cloud Functions or Cloud Run Functions
      !!process.env.FUNCTION_NAME || !!process.env.FUNCTION_TARGET ||
      // Azure Functions
      !!process.env.FUNCTIONS_WORKER_RUNTIME ||
      // AWS Lambda
      !!process.env.AWS_LAMBDA_FUNCTION_NAME
    );
  }
  
  /**
   * Determine if we're running in a container-based environment
   */
  isContainer() {
    return (
      // Google Cloud Run
      !!process.env.K_SERVICE ||
      // Kubernetes
      !!process.env.KUBERNETES_SERVICE_HOST ||
      // Docker
      !!process.env.DOCKER_CONTAINER
    );
  }
  
  /**
   * Check if we're running in a specific cloud environment
   */
  isCloudProvider(provider) {
    return this.config.cloud_provider === provider.toUpperCase();
  }
  
  /**
   * Check if running in Google Cloud environment
   */
  isGoogleCloud() {
    return (
      // Cloud Functions (1st & 2nd gen)
      !!process.env.FUNCTION_NAME ||
      // Cloud Run Functions
      !!process.env.FUNCTION_TARGET ||
      // Cloud Run
      !!process.env.K_SERVICE ||
      // GKE
      (!!process.env.KUBERNETES_SERVICE_HOST && !!process.env.GCP_PROJECT)
    );
  }

  /**
   * Determine if we're running in a cloud environment
   * @private
   * @returns {boolean} True if running in a cloud environment
   */
  _isRunningInCloud() {
    return (
      // Google Cloud Functions, Cloud Run Functions, or Cloud Run
      !!process.env.FUNCTION_NAME || !!process.env.FUNCTION_TARGET || !!process.env.K_SERVICE ||
      // Azure Functions
      !!process.env.FUNCTIONS_WORKER_RUNTIME ||
      // Azure App Service
      !!process.env.WEBSITE_SITE_NAME ||
      // AWS Lambda
      !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
      // AWS App Runner
      !!process.env.AWS_EXECUTION_ENV?.includes('AWS_AppRunner') ||
      // Kubernetes (could be running in any cloud)
      !!process.env.KUBERNETES_SERVICE_HOST
    );
  }
}

// Create a singleton instance of the Configuration class
const configuration = new Configuration();

// Export the singleton instance right away
// This avoids circular dependencies when initialization imports this module
export default configuration;

// Register with initialization tracker only after export
// We'll defer this to be initialized in index.js where we set up the serviceRegistry
// DO NOT directly require initialization here to prevent circular dependency