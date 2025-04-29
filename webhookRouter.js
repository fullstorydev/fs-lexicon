/**
 * WebhookRouter - Express router for handling various webhook endpoints
 * Routes incoming webhook data to appropriate services
 */
const express = require('express');
const { format } = require('date-fns');
const config = require('./config');
const { Logger } = require('./loggerFramework');
const { ErrorHandler, ERROR_TYPES } = require('./errorHandler');
const { LOG_LEVELS } = require('./loggerFramework');
const WebhookBase = require('./webhookBase');

// Import connector modules 
const slack = require('./Slack');
const googleCloud = require('./GoogleCloud');
const atlassian = require('./Atlassian');
const Fullstory = require('./Fullstory');
const snowflake = require('./Snowflake');
const konbini = require('./konbini');
const middleware = require('./middleware');

/**
 * WebhookRouter class for organizing webhook endpoint handlers
 */
class WebhookRouter extends WebhookBase {
  /**
   * Initialize webhook router
   */
  constructor() {
    super('Router');
    this.router = express.Router();
    this.jsonParser = express.json();
    
    try {
      // Validate critical configuration on startup
      this._validateCriticalConfig();
      
      // Configure all routes
      this.configureRoutes();
      
      this.logger.info('WebhookRouter initialized successfully');
    } catch (error) {
      this.logger.error('Error initializing WebhookRouter', error);
      throw new Error(`Failed to initialize WebhookRouter: ${error.message}`);
    }
  }

  /**
   * Validate critical configuration needed for webhook processing
   * @private
   */
  _validateCriticalConfig() {
    // List of critical configurations to check
    // Amend as needed
    const criticalConfigs = [
      { key: 'fs_org_api_key', name: 'Fullstory API key' },
      { key: 'fullstory_token', name: 'Fullstory token' },
      { key: 'fullstory_org_id', name: 'Fullstory org ID' }
    ];
    
    const missingConfigs = criticalConfigs
      .filter(item => !config.get(item.key))
      .map(item => item.name);
    
    if (missingConfigs.length > 0) {
      throw new Error(`Missing critical configuration: ${missingConfigs.join(', ')}`);
    }
  }

  /**
   * Configure routes for the router
   * @private
   */
  configureRoutes() {
    // Basic Slack webhook
    this.router.post("/slackHook", this.jsonParser, this.handleSlackHook.bind(this));

    // AI-specific Slack webhook
    this.router.post("/slackHookAI", this.jsonParser, this.handleSlackHookAI.bind(this));

    // Google Sheets webhook
    this.router.post("/googlesheets", 
      this.jsonParser, 
      middleware.validateJsonFields(['user']),
      this.handleGoogleSheets.bind(this)
    );

    // Jira ticket creation webhook
    this.router.post("/makeJiraTicket", 
      this.jsonParser,
      middleware.validateJsonFields(['user', 'name']),
      this.handleJiraTicket.bind(this)
    );

    // Fullstory Fusion webhook
    this.router.post("/fusion", 
      this.jsonParser,
      middleware.validateJsonFields(['user']),
      this.handleFusion.bind(this)
    );

    // Snowflake data update webhook
    this.router.post("/updateSnowflake",
      this.jsonParser,
      middleware.validateJsonFields(['user', 'properties']),
      this.handleSnowflakeUpdate.bind(this)
    );

    // BigQuery data update webhook
    this.router.post("/updateBigQuery",
      this.jsonParser,
      middleware.validateJsonFields(['user', 'properties']),
      this.handleBigQueryUpdate.bind(this)
    );
    
    // Error handling middleware
    this.router.use((err, req, res, next) => {
      this.logger.error('Webhook router error', err);
      res.status(500).json(this.errorHandler.handleError(err, 'Router middleware'));
    });
  }

  /**
   * Handle basic Slack webhook
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleSlackHook(req, res) {
    try {
      this.logWebhookStart('Slack', req);
      
      const data = this.extractCommonData(req.body);
      
      this.logger.info('Sending Slack webhook', { 
        event: data.event_name, 
        user: data.email 
      });
      
      const response = await slack.sendWebHook(data);
      
      if (!response) {
        this.logger.error('Slack API returned undefined response');
        return res.status(500).json(this.errorHandler.createApiError(
          new Error('Failed to communicate with Slack API'),
          'Slack'
        ));
      }
      
      // Log a warning if the response doesn't have 'ok' but don't treat it as an error
      if (!response.ok) {
        this.logger.warn('Slack API response missing "ok" property', response);
      }
      
      this.logWebhookCompletion('Slack', { 
        event: data.event_name, 
        success: true 
      });
      
      return res.status(204).end();
    } catch (error) {
      this.logger.error('Error in Slack webhook', error);
      return res.status(500).json(this.errorHandler.createApiError(error, 'Slack'));
    }
  }

  /**
   * Handle AI-specific Slack webhook
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleSlackHookAI(req, res) {
    try {
      this.logWebhookStart('SlackAI', req);
      
      const body = req.body;
      const baseData = this.extractCommonData(body);

      let data = { ...baseData };
      let response;
      
      // Add AI-specific properties if they exist
      if (body.properties) {
        this.logger.debug('Adding AI properties to data');
        data = {
          ...data,
          bail_score: body.properties.bail_score?.toString() ?? "Undefined",
          car_id: body.properties.car_id?.toString() ?? "Undefined",
          prediction: body.properties.prediction ?? "Undefined"
        };
        this.logger.info('Sending AI-specific Slack webhook');
        response = await slack.sendAIWebHook(data);
      } else {
        this.logger.info('No AI properties found, sending standard Slack webhook');
        response = await slack.sendWebHook(data);
      }
      
      if (!response) {
        this.logger.error('Slack API returned undefined response');
        return res.status(500).json(this.errorHandler.createApiError(
          new Error('Failed to communicate with Slack AI API'),
          'Slack AI'
        ));
      }
      
      // Log a warning if the response doesn't have 'ok' but don't treat it as an error
      if (!response.ok) {
        this.logger.warn('Slack AI API response missing "ok" property', response);
      }
      
      this.logWebhookCompletion('SlackAI', { 
        event: data.event_name, 
        hasAIProps: !!body.properties,
        success: true 
      });
      
      return res.status(204).end();
    } catch (error) {
      this.logger.error('Error in AI Slack webhook', error);
      return res.status(500).json(this.errorHandler.createApiError(error, 'Slack AI'));
    }
  }

  /**
   * Handle Google Sheets webhook
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleGoogleSheets(req, res) {
    try {
      this.logWebhookStart('GoogleSheets', req);
      
      const data = this.extractCommonData(req.body);
      
      // Validate required data fields
      const validationError = this.validateRequiredFields(
        data, 
        ['uid']
      );
      
      if (validationError) {
        this.logger.warn('Validation error for Google Sheets webhook', { 
          error: validationError.message 
        });
        return res.status(400).json(this.errorHandler.createValidationError(
          ['uid'], 
          validationError.message
        ));
      }
      
      // Fetch Fullstory session data
      this.logger.info('Fetching Fullstory data for Google Sheets', { 
        uid: data.uid, 
        session_id: data.session_id 
      });
      
      const fsData = await this.getFullstorySessionData(Fullstory, data.uid, data.session_id);
      
      // Get Sheets configuration
      const sheetsId = googleCloud.workspace.config?.sheets_id;
      const sheetsRange = config.get('google_sheets_range', 'Sheet1');
      
      if (!sheetsId) {
        this.logger.error('Missing Google Sheets ID configuration');
        return res.status(500).json(this.errorHandler.createErrorResponse(
          new Error('Missing Google Sheets configuration')
        ));
      }
      
      this.logger.info('Appending data to Google Sheets', { 
        sheetsId: sheetsId.substring(0, 8) + '...', // Only log part of the ID for security
        range: sheetsRange 
      });
      
      // Use the GoogleCloud workspace service with proper column order
      const response = await googleCloud.workspace.appendSpreadsheetValues(
        sheetsId,
        sheetsRange,
        [[
          data.display_name,         // DisplayName
          data.uid,                  // UserID
          data.email,                // Email
          fsData.replayURL,          // ReplayURL
          fsData.sessionSummary,     // SessionSummary
          data.session_id,           // SessionID
          data.timestamp,            // TimeStamp
          data.event_name,           // Webhookname
          data.api_version,          // APIVersion
          data.signal_version        // WebhookVersion
        ]]
      );

      if (response.updates?.updatedCells) {
        this.logger.info('Google Sheets update successful', {
          range: response.updates.updatedRange,
          rows: response.updates.updatedRows,
          columns: response.updates.updatedColumns,
          cells: response.updates.updatedCells
        });
        
        this.logWebhookCompletion('GoogleSheets', {
          user: data.email,
          session: data.session_id,
          updatedCells: response.updates.updatedCells
        });
        
        return res.status(204).end();
      } else {
        this.logger.error('Google Sheets API returned unexpected response', response);
        return res.status(500).json(this.errorHandler.createApiError(
          new Error('Failed to update Google Sheet'),
          'Google Sheets'
        ));
      }
    } catch (error) {
      this.logger.error('Error in Google Sheets webhook', error);
      return res.status(500).json(this.errorHandler.createApiError(error, 'Google Sheets'));
    }
  }

  /**
   * Handle Jira ticket creation webhook
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleJiraTicket(req, res) {
    try {
      this.logWebhookStart('Jira', req);
      
      // Grab body
      const body = req.body;

      // Validate required data
      if (!body.user || !body.name) {
        this.logger.warn('Missing required Jira ticket data', { 
          hasUser: !!body.user, 
          hasName: !!body.name 
        });
        return res.status(400).json(this.errorHandler.createValidationError(
          ['user', 'name'], 
          'Missing required user or name data for Jira ticket'
        ));
      }

      this.logger.info('Creating ticket rundown', { 
        eventName: body.name 
      });
      const rundown = await konbini.eventFormatter.createRunDown(body);

      // Create session link
      const sessionId = body.properties?.session_id;
      this.logger.debug('Creating Fullstory session link', { 
        userId: body.user.id, 
        sessionId 
      });
      const sessionLink = Fullstory.getSessionLink(body.user.id, sessionId);

      // Get configuration values with proper error handling
      const projectKey = config.get('jira_project_key');
      const issueTypeId = config.get('jira_issue_type_id');
      const customFieldId = config.get('jira_session_field_id', 'customfield_10916');
      
      if (!projectKey || !issueTypeId) {
        this.logger.error('Missing required Jira configuration', {
          hasProjectKey: !!projectKey,
          hasIssueTypeId: !!issueTypeId
        });
        throw new Error('Missing required Jira configuration: project key or issue type ID');
      }

      // Create ticket data
      this.logger.debug('Preparing Jira ticket data');
      const ticketData = {
        fields: {
          summary: `${body.name} - ${body.user.email ?? body.user.id}`,
          description: rundown,
          project: {
            key: projectKey
          },
          issuetype: {
            id: issueTypeId
          }
        }
      };

      // Add session link to custom field if we have one
      if (sessionLink) {
        this.logger.debug('Adding session link to ticket data');
        ticketData.fields[customFieldId] = sessionLink;
      }

      // Create ticket with atlassian client
      this.logger.info('Creating Jira ticket', { 
        summary: ticketData.fields.summary 
      });
      const ticket = await atlassian.createTicket(ticketData);

      // Return ticket status with consistent response format
      const responseData = {
        ticketKey: ticket.key,
        ticketId: ticket.id,
        ticketUrl: `${atlassian.jira_base_url}/browse/${ticket.key}`,
      };
      
      this.logWebhookCompletion('Jira', responseData);
      
      return res.status(200).json(this.createSuccessResponse(
        responseData, 
        'Jira ticket created successfully'
      ));
    } catch (error) {
      this.logger.error('Error creating Jira ticket', error);
      return res.status(500).json(this.errorHandler.createApiError(error, 'Jira'));
    }
  }

  /**
   * Handle Fullstory Fusion webhook
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleFusion(req, res) {
    try {
      this.logWebhookStart('Fusion', req);
      
      const body = req.body;
      
      // Validate required data
      if (!body.user) {
        this.logger.warn('Missing user object in Fusion request');
        return res.status(400).json(this.errorHandler.createValidationError(
          'user', 
          'Missing user object in request payload'
        ));
      }
      
      // Use extractCommonData for consistent data extraction across routes
      const data = this.extractCommonData(body);
      
      // Add Fusion-specific properties
      data.properties = body.properties ?? {};
      
      // Validate uid and session_id
      const validationError = this.validateRequiredFields(
        data, 
        ['uid', 'session_id']
      );
      
      if (validationError) {
        this.logger.warn('Validation error in Fusion webhook', { 
          error: validationError.message 
        });
        return res.status(400).json(this.errorHandler.createValidationError(
          ['uid', 'session_id'], 
          validationError.message
        ));
      }
      
      this.logger.info('Posting custom event to Fullstory', {
        userId: data.uid,
        sessionId: data.session_id,
        propertyCount: Object.keys(data.properties).length
      });
      
      const response = await Fullstory.postCustomEvent(
        data.uid,
        data.session_id,
        data.properties
      );

      if (response.status === 200) {
        this.logWebhookCompletion('Fusion', {
          userId: data.uid,
          eventName: data.event_name,
          success: true
        });
        return res.status(204).end();
      } else {
        this.logger.error('Fullstory API returned non-200 status', {
          status: response.status,
          statusText: response.statusText
        });
        
        return res.status(response.status).json(this.errorHandler.createApiError(
          new Error(`Fullstory API returned status: ${response.status}`),
          'Fullstory'
        ));
      }
    } catch (error) {
      this.logger.error('Error in Fusion webhook', error);
      return res.status(500).json(this.errorHandler.createApiError(error, 'Fullstory Fusion'));
    }
  }

  /**
   * Handle Snowflake data update webhook
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleSnowflakeUpdate(req, res) {
    try {
      this.logWebhookStart('Snowflake', req);
      
      // Extract and validate data
      const { user, properties } = req.body;
      
      if (!user) {
        this.logger.warn('User object is missing in the request');
        return res.status(400).json(this.errorHandler.createValidationError('user', 'Missing user object in request payload'));
      }
      
      if (!properties) {
        this.logger.warn('Properties object is missing in the request');
        return res.status(400).json(this.errorHandler.createValidationError('properties', 'Missing properties object in request payload'));
      }
      
      // Use extractCommonData for consistent data extraction across routes
      const data = this.extractCommonData(req.body);
      
      // Add Snowflake-specific fields
      data.product_name = properties?.product_name ?? "Undefined";
      data.product_size = properties?.product_size ?? "Undefined";
      data.url = properties?.url ?? "Undefined";

      this.logger.debug('Processed webhook data', data);

      // Validate required data fields
      const validationError = this.validateRequiredFields(
        data, 
        ['uid', 'product_name']
      );
      
      if (validationError) {
        this.logger.warn('Validation error', { error: validationError.message });
        return res.status(400).json(this.errorHandler.createValidationError(
          ['uid', 'product_name'], 
          validationError.message
        ));
      }

      // Fetch Fullstory session data
      this.logger.info('Fetching Fullstory data', { uid: data.uid, session_id: data.session_id });
      let fsData;
      try {
        fsData = await this.getFullstorySessionData(Fullstory, data.uid, data.session_id);
        this.logger.debug('Successfully retrieved Fullstory session data');
      } catch (fsError) {
        this.logger.error('Error fetching Fullstory data', fsError);
        fsData = {
          replayURL: "Error retrieving replay URL",
          sessionSummary: "Error retrieving session summary"
        };
      }

      // Generate SQL with detailed error handling
      this.logger.info('Generating SQL for Snowflake insertion');
      let sqlResult;
      try {
        sqlResult = konbini.warehouse.generateSql({
          databaseType: 'snowflake',
          operation: 'insert',
          table: 'STOCK_MANAGEMENT',
          columns: [
            'item_name:product_name',
            'item_size:product_size',
            'user_id:uid',
            'session_id',
            'url',
            'replay_url',
            'session_summary',
            'email',
            'session_time:time'
          ],
          data: {
            product_name: data.product_name,
            product_size: data.product_size,
            uid: data.uid,
            session_id: data.session_id,
            url: data.url,
            time: data.time,
            email: data.email
          },
          customParams: {
            replay_url: fsData.replayURL,
            session_summary: fsData.sessionSummary
          }
        });
      } catch (sqlError) {
        this.logger.error('SQL generation failed', sqlError);
        return res.status(400).json(this.errorHandler.createErrorResponse(
          new Error(`SQL generation failed: ${sqlError.message}`)
        ));
      }

      const { sql, bindings } = sqlResult;

      // Execute Snowflake operations with more robust error handling
      try {
        this.logger.info('Executing Snowflake query');
        this.logger.debug('Snowflake query details', {
          sqlPreview: sql.substring(0, 200) + '...',
          bindingsCount: Object.keys(bindings).length
        });
        
        await snowflake.withConnection(async (connector) => {
          await connector.executeQuery(sql, bindings);
        });
        this.logger.info('Snowflake query executed successfully');
      } catch (dbError) {
        this.logger.error('Snowflake database operation failed', dbError);
        
        // Use the new helper to format the database operation more accurately
        const formattedOperation = this.formatDatabaseOperation(sqlResult.operation, sqlResult.table);
        
        return res.status(500).json(this.errorHandler.createDatabaseError(
          dbError, 
          formattedOperation
        ));
      }

      // Return consistent response format
      const responseData = {
        product_name: data.product_name,
        product_size: data.product_size,
        user_id: data.uid
      };
      
      this.logWebhookCompletion('Snowflake', responseData);
      return res.status(200).json(this.createSuccessResponse(
        responseData, 
        'Data successfully inserted into Snowflake'
      ));
    } catch (error) {
      // Enhanced error logging for the entire handler
      this.logger.error('Uncaught error in Snowflake webhook handler', error);
      return res.status(500).json(this.errorHandler.handleError(error, 'Snowflake webhook'));
    }
  }

  /**
   * Handle BigQuery data update webhook
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleBigQueryUpdate(req, res) {
    try {
      this.logWebhookStart('BigQuery', req);
      
      // Extract and validate data
      const { user, properties } = req.body;
      
      if (!user) {
        this.logger.warn('User object is missing in the request');
        return res.status(400).json(this.errorHandler.createValidationError('user', 'Missing user object in request payload'));
      }
      
      if (!properties) {
        this.logger.warn('Properties object is missing in the request');
        return res.status(400).json(this.errorHandler.createValidationError('properties', 'Missing properties object in request payload'));
      }
      
      // Use extractCommonData for consistent data extraction across routes
      const data = this.extractCommonData(req.body);
      
      // Add BigQuery-specific fields
      data.form_field = properties?.form_field ?? "Undefined";
      data.url = properties?.url ?? "Undefined";

      this.logger.debug('Processed webhook data', data);

      // Validate required data fields
      const validationError = this.validateRequiredFields(
        data, 
        ['uid', 'form_field']
      );
      
      if (validationError) {
        this.logger.warn('Validation error', { error: validationError.message });
        return res.status(400).json(this.errorHandler.createValidationError(
          ['uid', 'form_field'], 
          validationError.message
        ));
      }

      // Fetch Fullstory session data
      this.logger.info('Fetching Fullstory data', { uid: data.uid, session_id: data.session_id });
      let fsData;
      try {
        fsData = await this.getFullstorySessionData(Fullstory, data.uid, data.session_id);
        this.logger.debug('Successfully retrieved Fullstory session data');
      } catch (fsError) {
        this.logger.error('Error fetching Fullstory data', fsError);
        fsData = {
          replayURL: "Error retrieving replay URL",
          sessionSummary: "Error retrieving session summary"
        };
      }

      // Generate SQL with detailed error handling
      this.logger.info('Generating SQL for BigQuery insertion');
      let sqlResult;
      try {
        sqlResult = konbini.warehouse.generateSql({
          databaseType: 'bigquery',
          operation: 'insert',
          table: 'fs_data_destinations.lead_info',
          columns: [
            'session_id',
            'visitor_id',
            'form_type:form_field',
            'form_submission_time:time',
            'session_summary'
          ],
          data: {
            session_id: data.session_id,
            visitor_id: data.uid,
            form_field: data.form_field,
            time: data.time,
            session_summary: fsData.sessionSummary
          }
        });
      } catch (sqlError) {
        this.logger.error('SQL generation failed', sqlError);
        return res.status(400).json(this.errorHandler.createErrorResponse(
          new Error(`SQL generation failed: ${sqlError.message}`)
        ));
      }

      const { sql, params, parameterTypes } = sqlResult;

      // Execute BigQuery operations with more robust error handling
      try {
        this.logger.info('Executing BigQuery query');
        this.logger.debug('BigQuery query details', {
          sqlPreview: sql.substring(0, 200) + '...',
          paramsCount: Object.keys(params).length,
          parameterTypesCount: Object.keys(parameterTypes || {}).length
        });
        
        await googleCloud.bigQuery.createQueryJob(sql, [], {
          params,
          parameterTypes
        });
        this.logger.info('BigQuery operation executed successfully');
      } catch (dbError) {
        this.logger.error('BigQuery database operation failed', dbError);
        
        // Use the new helper to format the database operation more accurately
        const formattedOperation = this.formatDatabaseOperation(sqlResult.operation, sqlResult.table);
        
        return res.status(500).json(this.errorHandler.createDatabaseError(
          dbError, 
          formattedOperation
        ));
      }

      // Return consistent response format
      const responseData = {
        form_completed: data.form_field,
        session_id: data.session_id,
        user_id: data.uid
      };
      
      this.logWebhookCompletion('BigQuery', responseData);
      return res.status(200).json(this.createSuccessResponse(
        responseData, 
        'Data successfully inserted into BigQuery'
      ));
    } catch (error) {
      // Enhanced error logging for the entire handler
      this.logger.error('Uncaught error in BigQuery webhook handler', error);
      return res.status(500).json(this.errorHandler.handleError(error, 'BigQuery webhook'));
    }
  }

  /**
   * Get the configured router instance
   * @returns {Object} Express router
   */
  getRouter() {
    return this.router;
  }
}

// Create a singleton instance of the WebhookRouter
const webhookRouterInstance = new WebhookRouter();

// Register with initialization tracker
const initialization = require('./initialization');

try {
  // Use the router instance directly to automatically detect routes
  initialization.markRouterInitialized('Webhook:Router', webhookRouterInstance.router);
} catch (error) {
  initialization.markFailed('Webhook:Router', error);
}

// Export the router instance
module.exports = webhookRouterInstance.getRouter();
