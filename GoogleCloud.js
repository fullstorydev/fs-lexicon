/**
 * Google Cloud integration services for Lexicon
 * Provides access to BigQuery and other Google Cloud services
 */
const { BigQuery } = require('@google-cloud/bigquery');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const ConnectorBase = require('./connectorBase');
const serviceRegistry = require('./serviceRegistry');

/**
 * Base class for Google Cloud services
 */
class GoogleCloudConnector extends ConnectorBase {
  constructor(name) {
    super(name || 'GoogleCloud');
    
    // Use ConnectorBase validation methods
    this.projectId = this.getConfig('google_project_id', null);
    this.keyFilename = this.getConfig('google_workspace_keyfile', null);
    
    // Check if configuration is valid
    this.isConfigured = this.validator.checkIsConfigured();
  }

  async _initializeConnector() {
    // Basic initialization checks for Google Cloud services
    return {
      projectId: this.projectId || 'not-configured',
      isConfigured: this.isConfigured
    };
  }
}

/**
 * BigQuery service for data warehousing operations
 */
class BigQueryConnector extends GoogleCloudConnector {
  constructor() {
    super('BigQuery');
    
    // Use BigQuery-specific keyfile if available, otherwise fall back to common keyfile
    const bigqueryKeyfile = this.getConfig('bigquery_keyfile');
    
    try {
      const options = {
        projectId: this.projectId
      };
      
      // Add credentials if available
      if (bigqueryKeyfile) {
        options.keyFilename = bigqueryKeyfile;
      } else if (this.keyFilename) {
        options.keyFilename = this.keyFilename;
      }
      
      this.client = new BigQuery(options);
    } catch (error) {
      this.logger.error('Failed to initialize BigQuery client:', error);
      this.client = null;
    }
  }
  
  async _initializeConnector() {
    return {
      status: this.isConfigured ? 'configured' : 'not_configured',
      projectId: this.projectId,
      hasClient: !!this.client
    };
  }

  /**
   * Initialize and return the BigQuery connection
   * @returns {BigQuery} Initialized BigQuery connection
   */
  createConnection() {
    if (!this.client) {
      this.logger.warn("BigQuery client was not initialized properly. Attempting to reconnect.");
      try {
        const options = {
          projectId: this.projectId
        };
        
        if (config.get('bigquery_keyfile')) {
          options.keyFilename = config.get('bigquery_keyfile');
        } else if (this.keyFilename) {
          options.keyFilename = this.keyFilename;
        }
        
        this.client = new BigQuery(options);
        this.logger.info("BigQuery connection re-initialized.");
      } catch (error) {
        this.logger.error("Failed to re-initialize BigQuery client:", error);
        throw error;
      }
    }
    return this.client;
  }

  /**
   * Execute a query against BigQuery
   * @param {string} query - SQL query to execute
   * @param {Array} parameters - Array of parameters for positional binding
   * @param {Object} queryOptions - Additional options for the query
   * @returns {Promise<Array>} Query results
   * @throws {Error} If query execution fails
   */
  async createQueryJob(query, parameters = [], queryOptions = {}) {
    return this.safeExecute(async () => {
      if (!this.isConfigured) {
        this.logger.warn('BigQuery operation skipped: not configured');
        return [];
      }
      
      // Ensure connection is established
      const bigquery = this.createConnection();

      const options = {
        query: query,
        params: parameters,
        ...queryOptions
      };

      // Create and wait for the query to finish
      const [job] = await bigquery.createQueryJob(options);
      this.logger.info(`BigQuery job ${job.id} started.`);

      // Wait for the query to complete
      const [rows] = await job.getQueryResults();
      
      return rows;
    }, 'createQueryJob', []);
  }

  /**
   * Create a table in BigQuery if it doesn't exist
   * @param {string} datasetId - Dataset ID
   * @param {string} tableId - Table ID
   * @param {Object} schema - Table schema definition
   * @param {Object} [options] - Additional table options
   * @returns {Promise<Object>} Created or existing table
   * @throws {Error} If table creation fails
   */
  async createTableIfNotExists(datasetId, tableId, schema, options = {}) {
    return this.safeExecute(async () => {
      const bigquery = this.createConnection();
      const dataset = bigquery.dataset(datasetId);
      const table = dataset.table(tableId);
      
      const [exists] = await table.exists();
      
      if (!exists) {
        this.logger.info(`Creating table ${datasetId}.${tableId}`);
        const tableOptions = {
          schema,
          timePartitioning: {
            type: 'DAY',
            field: 'timestamp'
          },
          ...options
        };
        
        const [newTable] = await dataset.createTable(tableId, tableOptions);
        this.logger.info(`Table ${datasetId}.${tableId} created.`);
        return newTable;
      } else {
        this.logger.info(`Table ${datasetId}.${tableId} already exists.`);
        return table;
      }
    }, `createTableIfNotExists(${datasetId}.${tableId})`, null);
  }

  /**
   * Insert rows into a BigQuery table
   * @param {string} datasetId - Dataset ID
   * @param {string} tableId - Table ID
   * @param {Array<Object>} rows - Rows to insert
   * @returns {Promise<Object>} Insert results
   * @throws {Error} If insertion fails
   */
  async insertRows(datasetId, tableId, rows) {
    return this.safeExecute(async () => {
      const bigquery = this.createConnection();
      const dataset = bigquery.dataset(datasetId);
      const table = dataset.table(tableId);
      
      const [apiResponse] = await table.insert(rows);
      this.logger.info(`Inserted ${rows.length} rows into ${datasetId}.${tableId}`);
      
      return apiResponse;
    }, `insertRows(${datasetId}.${tableId})`, null);
  }
}

/**
 * Google Workspace service for interacting with Google APIs
 */
class WorkspaceConnector extends GoogleCloudConnector {
  constructor() {
    super('Workspace');
    this.auth = null;
    // Use ConnectorBase methods
    this.keyFile = this.getConfig('google_workspace_keyfile') || this.keyFilename;
    this._sheetsClient = null;
    
    // Worksheet configurations
    this.config = {
      sheets_id: this.getConfig('google_sheets_id'),
      default_sheet: this.getConfig('google_sheets_range', 'Sheet1')
    };
  }
  
  async _initializeConnector() {
    return {
      status: this.isConfigured ? 'configured' : 'not_configured',
      hasKeyFile: !!this.keyFile,
      hasSheetId: !!this.config.sheets_id,
      defaultSheet: this.config.default_sheet
    };
  }

  /**
   * Initialize Google authentication
   * @returns {Promise<google.auth.JWT>} Authenticated client
   */
  async authenticate() {
    return this.safeExecute(async () => {
      if (!this.isConfigured) {
        this.logger.warn('Google Workspace authentication skipped: not configured');
        throw new Error('Google Workspace not properly configured');
      }
      
      if (!this.auth) {
        if (!this.keyFile) {
          throw new Error("No workspace keyfile configured. Set workspace_keyfile in config.");
        }
        
        // Check if keyFile is a path or already parsed JSON
        let keyFileContents;
        
        if (typeof this.keyFile === 'string') {
          try {
            // First try to parse it as JSON (direct content from Secret Manager)
            keyFileContents = JSON.parse(this.keyFile);
            this.logger.debug("Successfully parsed keyFile content as JSON");
          } catch (parseError) {
            // If it's not valid JSON, treat it as a file path
            try {
              // Check if file exists
              if (fs.existsSync(this.keyFile)) {
                const fileContent = fs.readFileSync(this.keyFile, 'utf8');
                keyFileContents = JSON.parse(fileContent);
                this.logger.debug("Successfully loaded keyFile from path");
              } else {
                throw new Error(`Key file does not exist at path: ${this.keyFile}`);
              }
            } catch (fileError) {
              this.logger.error("Error reading keyFile:", fileError);
              throw new Error(`Invalid keyFile. Not valid JSON and not a valid file path: ${fileError.message}`);
            }
          }
        } else if (typeof this.keyFile === 'object') {
          // It's already an object
          keyFileContents = this.keyFile;
        } else {
          throw new Error(`Invalid keyFile type: ${typeof this.keyFile}`);
        }
        
        // Validate required fields in the key file
        if (!keyFileContents.client_email || !keyFileContents.private_key) {
          throw new Error("Invalid key file content. Missing client_email or private_key.");
        }
        
        // Only include Sheets scope
        this.auth = new google.auth.JWT(
          keyFileContents.client_email,
          null,
          keyFileContents.private_key,
          ['https://www.googleapis.com/auth/spreadsheets']
        );
        
        await this.auth.authorize();
        this.logger.info("Google Workspace authentication successful");
      }
      
      return this.auth;
    }, 'authenticate', null);
  }
  
  /**
   * Get authenticated Sheets API client
   * @returns {Promise<Object>} Google Sheets API client
   */
  async getSheetsClient() {
    return this.safeExecute(async () => {
      if (!this.isConfigured) {
        this.logger.warn('Google Sheets client request skipped: not configured');
        throw new Error('Google Sheets not properly configured');
      }
      
      if (this._sheetsClient) {
        return this._sheetsClient;
      }
      
      const auth = await this.authenticate();
      this._sheetsClient = google.sheets({ version: 'v4', auth });
      return this._sheetsClient;
    }, 'getSheetsClient', null);
  }
  
  /**
   * Common method to handle spreadsheet operations
   * @param {string} operation - 'update' or 'append'
   * @param {string} spreadsheetId - ID of the spreadsheet
   * @param {string} range - Cell range 
   * @param {Array<Array<*>>} values - 2D array of values
   * @param {string} valueInputOption - How to interpret the data
   * @returns {Promise<Object>} Operation result
   * @private
   */
  async _handleSpreadsheetOperation(operation, spreadsheetId, range, values, valueInputOption = 'USER_ENTERED') {
    return this.safeExecute(async () => {
      if (!this.isConfigured) {
        this.logger.warn(`Spreadsheet ${operation} operation skipped: not configured`);
        return { updates: { updatedCells: 0 } };
      }
      
      // Input validation
      if (!spreadsheetId) throw new Error('Spreadsheet ID is required');
      if (!range) throw new Error('Range is required');
      if (!values || !Array.isArray(values)) throw new Error('Values must be provided as an array');
      
      // Get authenticated client
      const sheets = await this.getSheetsClient();
      
      // Prepare request
      const request = {
        spreadsheetId,
        range,
        valueInputOption,
        resource: { values }
      };
      
      // Execute operation
      let response;
      if (operation === 'update') {
        response = await sheets.spreadsheets.values.update(request);
        this.logger.info(`${response.data.updatedCells} cells updated.`);
      } else if (operation === 'append') {
        response = await sheets.spreadsheets.values.append(request);
        this.logger.info(`${response.data.updates.updatedCells} cells appended.`);
      } else {
        throw new Error(`Unsupported operation: ${operation}`);
      }
      
      return response.data;
    }, `${operation}SpreadsheetValues`, { updates: { updatedCells: 0 } });
  }
  
  /**
   * Update data to a spreadsheet
   * @param {string} spreadsheetId - ID of the spreadsheet
   * @param {string} range - Cell range (e.g. 'Sheet1!A1:B2')
   * @param {Array<Array<*>>} values - 2D array of values to write
   * @param {string} valueInputOption - How to interpret the data
   * @returns {Promise<Object>} Update result
   */
  async updateSpreadsheetValues(spreadsheetId, range, values, valueInputOption = 'USER_ENTERED') {
    return this._handleSpreadsheetOperation('update', spreadsheetId, range, values, valueInputOption);
  }
  
  /**
   * Append data to a spreadsheet
   * @param {string} spreadsheetId - ID of the spreadsheet
   * @param {string} range - Cell range (e.g. 'Sheet1!A1')
   * @param {Array<Array<*>>} values - 2D array of values to append
   * @param {string} valueInputOption - How to interpret the data
   * @returns {Promise<Object>} Append result
   */
  async appendSpreadsheetValues(spreadsheetId, range, values, valueInputOption = 'USER_ENTERED') {
    return this._handleSpreadsheetOperation('append', spreadsheetId, range, values, valueInputOption);
  }
  
  /**
   * Get all values from a spreadsheet range
   * @param {string} spreadsheetId - ID of the spreadsheet
   * @param {string} range - Cell range (e.g. 'Sheet1!A1:Z')
   * @returns {Promise<Array<Array<*>>>} 2D array of values
   */
  async getSpreadsheetValues(spreadsheetId, range) {
    return this.safeExecute(async () => {
      // Input validation
      if (!spreadsheetId) throw new Error('Spreadsheet ID is required');
      if (!range) throw new Error('Range is required');
      
      // Get authenticated client
      const sheets = await this.getSheetsClient();
      
      // Prepare request
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
      });
      
      return response.data.values || [];
    }, `getSpreadsheetValues(${spreadsheetId}, ${range})`, []);
  }
}

// Create connector instances only once
const bigQueryConnector = new BigQueryConnector();
const workspaceConnector = new WorkspaceConnector();

// Initialize connectors
bigQueryConnector.initialize()
  .catch(error => {
    console.error('Error initializing BigQuery connector:', error);
  });

workspaceConnector.initialize()
  .catch(error => {
    console.error('Error initializing Google Workspace connector:', error);
  });

// Register in the service registry
serviceRegistry.register('bigQuery', bigQueryConnector);
serviceRegistry.register('googleWorkspace', workspaceConnector);

// Export combined services object
const googleCloud = {
  bigQuery: bigQueryConnector,
  workspace: workspaceConnector
};

// Export the combined services object
module.exports = googleCloud;