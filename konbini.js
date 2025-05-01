/**
 * Konbini - A lightweight utilities library for Lexicon
 * Provides database abstractions and formatting utilities
 */
const { Logger } = require('./loggerFramework');
const serviceRegistry = require('./serviceRegistry');

// Initialize logger
const logger = new Logger('Konbini');

/**
 * Main Konbini class that contains all utility modules
 */
class Konbini {
  constructor() {
    // Initialize components
    this.warehouse = new Warehouse();
    this.eventFormatter = new EventFormatter();
    
    logger.debug('Konbini initialized with Warehouse and EventFormatter');
  }
}

/**
 * Warehouse - Database abstraction layer for multiple database engines
 * Provides SQL generation for different database platforms
 */
class Warehouse {
  constructor() {
    this.logger = new Logger('Warehouse');
  }
  
  // Define supported operations as static constants
  static get OPERATIONS() {
    return {
      INSERT: 'insert',
      SELECT: 'select',
      UPDATE: 'update',
      DELETE: 'delete'
    };
  }

  /**
   * Format a database operation for error messages with proper prepositions
   * @param {string} operation - SQL operation type (insert, select, update, delete)
   * @param {string} table - Table name
   * @returns {string} Formatted operation string
   */
  formatOperation(operation, table) {
    if (!operation || !table) {
      return 'unknown database operation';
    }
    
    // Choose appropriate preposition/format based on operation type
    switch (operation.toLowerCase()) {
      case Warehouse.OPERATIONS.SELECT:
        return `SELECT from ${table}`;
      case Warehouse.OPERATIONS.INSERT:
        return `INSERT into ${table}`;
      case Warehouse.OPERATIONS.UPDATE:
        return `UPDATE on ${table}`;
      case Warehouse.OPERATIONS.DELETE:
        return `DELETE from ${table}`;
      default:
        return `${operation} on ${table}`;
    }
  }

  /**
   * Generate database-specific SQL and parameters
   * @param {Object} options - Configuration options
   * @param {string} options.databaseType - Type of database (bigquery, snowflake, redshift)
   * @param {string} options.operation - SQL operation (insert, select, update, delete)
   * @param {Object} options.data - Data values for parameters
   * @param {string} options.table - Table name for the operation
   * @param {string[]} options.columns - Columns to use in the operation
   * @param {Object} [options.where] - Where clause conditions
   * @param {Object} [options.customParams] - Optional override for specific parameters
   * @returns {Object} Database-specific SQL and parameters
   * @throws {Error} If required parameters are missing or invalid
   */
  generateSql({
    databaseType,
    operation,
    data,
    table,
    columns,
    where = {},
    customParams = {}
  }) {
    // Validate required parameters
    if (!databaseType || !operation || !data || !table || !columns || !Array.isArray(columns)) {
      this.logger.error('Missing required SQL generation parameters');
      throw new Error('Missing required parameters: databaseType, operation, data, table, and columns array');
    }

    this.logger.debug('Generating SQL', { 
      database: databaseType, 
      operation, 
      table,
      columnCount: columns.length
    });

    // Normalize operation to lowercase
    const normalizedOperation = operation.toLowerCase();

    // Check if operation is valid
    if (!Object.values(Warehouse.OPERATIONS).includes(normalizedOperation)) {
      throw new Error(`Invalid operation: ${operation}. Must be one of: ${Object.values(Warehouse.OPERATIONS).join(', ')}`);
    }

    // Build a params object from data and columns, with custom overrides
    const params = {};
    columns.forEach(column => {
      // Allow for column mapping with colName:dataKey format
      const [colName, dataKey] = column.includes(':') ? column.split(':') : [column, column];
      params[colName] = customParams[colName] !== undefined ? customParams[colName] :
                      (data[dataKey] !== undefined ? data[dataKey] : null);
    });
    
    // Clean column names (remove mapping part)
    const cleanColumns = columns.map(col => col.includes(':') ? col.split(':')[0] : col);
    
    // Get a database adapter for the specified type
    const adapter = this._getAdapter(databaseType);
    
    // Use the adapter to generate SQL
    return adapter.generateSql(normalizedOperation, table, cleanColumns, params, where);
  }
  
  /**
   * Get a database adapter for the specified type
   * @param {string} databaseType - Type of database
   * @returns {DatabaseAdapter} Database adapter
   * @throws {Error} If database type is not supported
   * @private
   */
  _getAdapter(databaseType) {
    switch(databaseType.toLowerCase()) {
      case 'bigquery':
        return new BigQueryAdapter();
      
      case 'snowflake':
        return new SnowflakeAdapter();
      
      case 'redshift':
        return new RedshiftAdapter();
      
      default:
        throw new Error(`Unsupported database type: ${databaseType}. Supported types are: bigquery, snowflake, redshift`);
    }
  }
}

/**
 * Base adapter class for database operations
 * @abstract
 */
class DatabaseAdapter {
  /**
   * Generate SQL statement based on operation
   * @param {string} operation - SQL operation
   * @param {string} table - Table name
   * @param {string[]} columns - Column names
   * @param {Object} params - Parameter values
   * @param {Object} where - Where conditions
   * @returns {Object} SQL query and parameters
   * @throws {Error} If operation is not supported
   */
  generateSql(operation, table, columns, params, where) {
    switch(operation) {
      case 'insert':
        return this.generateInsertSql(table, columns, params);
      
      case 'select':
        return this.generateSelectSql(table, columns, params, where);
      
      case 'update':
        return this.generateUpdateSql(table, columns, params, where);
      
      case 'delete':
        return this.generateDeleteSql(table, params, where);
      
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }
  
  // Abstract methods to be implemented by subclasses
  generateInsertSql(table, columns, params) { throw new Error('Not implemented'); }
  generateSelectSql(table, columns, params, where) { throw new Error('Not implemented'); }
  generateUpdateSql(table, columns, params, where) { throw new Error('Not implemented'); }
  generateDeleteSql(table, params, where) { throw new Error('Not implemented'); }
}

/**
 * BigQuery adapter
 */
class BigQueryAdapter extends DatabaseAdapter {
  generateInsertSql(table, columns, params) {
    const paramPlaceholders = columns.map(col => `@${col}`).join(', ');
    const parameterTypes = this._generateParameterTypes(params);
    
    return {
      sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${paramPlaceholders})`,
      params,
      parameterTypes
    };
  }
  
  generateSelectSql(table, columns, params, where) {
    // Build where clause
    const whereClause = this._buildWhereClause(where);
    const whereCondition = whereClause ? ` WHERE ${whereClause}` : '';
    
    // Create parameter types
    const parameterTypes = this._generateParameterTypes(params);
    
    // Merge where clause parameters into params
    for (const key in where) {
      params[`where_${key}`] = where[key];
      parameterTypes[`where_${key}`] = this._getType(where[key]);
    }
    
    return {
      sql: `SELECT ${columns.join(', ')} FROM ${table}${whereCondition}`,
      params,
      parameterTypes
    };
  }
  
  generateUpdateSql(table, columns, params, where) {
    // Build set clause
    const setClause = columns.map(col => `${col} = @${col}`).join(', ');
    
    // Build where clause
    const whereClause = this._buildWhereClause(where);
    const whereCondition = whereClause ? ` WHERE ${whereClause}` : '';
    
    // Create parameter types
    const parameterTypes = this._generateParameterTypes(params);
    
    // Merge where clause parameters into params
    for (const key in where) {
      params[`where_${key}`] = where[key];
      parameterTypes[`where_${key}`] = this._getType(where[key]);
    }
    
    return {
      sql: `UPDATE ${table} SET ${setClause}${whereCondition}`,
      params,
      parameterTypes
    };
  }
  
  generateDeleteSql(table, params, where) {
    // Build where clause
    const whereClause = this._buildWhereClause(where);
    const whereCondition = whereClause ? ` WHERE ${whereClause}` : '';
    
    // Create parameter types for where conditions
    const parameterTypes = {};
    
    // Merge where clause parameters into params
    for (const key in where) {
      params[`where_${key}`] = where[key];
      parameterTypes[`where_${key}`] = this._getType(where[key]);
    }
    
    return {
      sql: `DELETE FROM ${table}${whereCondition}`,
      params,
      parameterTypes
    };
  }
  
  _buildWhereClause(where) {
    const conditions = [];
    for (const key in where) {
      conditions.push(`${key} = @where_${key}`);
    }
    return conditions.join(' AND ');
  }
  
  _generateParameterTypes(params) {
    const parameterTypes = {};
    Object.keys(params).forEach(key => {
      parameterTypes[key] = this._getType(params[key]);
    });
    return parameterTypes;
  }
  
  _getType(value) {
    if (value === null) {
      return { type: 'STRING' }; // Default for nulls
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return { type: 'INTEGER' };
      } else {
        return { type: 'FLOAT' };
      }
    } else if (value instanceof Date) {
      return { type: 'TIMESTAMP' };
    } else if (Array.isArray(value)) {
      return { type: 'ARRAY', arrayElementType: { type: 'STRING' } };
    } else if (typeof value === 'object') {
      return { type: 'JSON' };
    } else {
      return { type: 'STRING' };
    }
  }
}

/**
 * Snowflake adapter
 */
class SnowflakeAdapter extends DatabaseAdapter {
  generateInsertSql(table, columns, params) {
    const paramPlaceholders = columns.map((_, index) => `:${index + 1}`).join(', ');
    const bindings = columns.map(col => params[col]);
    
    return {
      sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${paramPlaceholders})`,
      bindings
    };
  }
  
  generateSelectSql(table, columns, params, where) {
    // Convert where object to array of conditions and values
    const { whereClause, bindings } = this._buildWhereClause(where);
    const whereCondition = whereClause ? ` WHERE ${whereClause}` : '';
    
    return {
      sql: `SELECT ${columns.join(', ')} FROM ${table}${whereCondition}`,
      bindings
    };
  }
  
  generateUpdateSql(table, columns, params, where) {
    // Build set clause with positional parameters
    let paramIndex = 1;
    const setClause = columns.map(col => `${col} = :${paramIndex++}`).join(', ');
    const setValues = columns.map(col => params[col]);
    
    // Convert where object to array of conditions and values
    const { whereClause, bindings } = this._buildWhereClause(where, paramIndex);
    const whereCondition = whereClause ? ` WHERE ${whereClause}` : '';
    
    return {
      sql: `UPDATE ${table} SET ${setClause}${whereCondition}`,
      bindings: [...setValues, ...bindings]
    };
  }
  
  generateDeleteSql(table, params, where) {
    // Convert where object to array of conditions and values
    const { whereClause, bindings } = this._buildWhereClause(where);
    const whereCondition = whereClause ? ` WHERE ${whereClause}` : '';
    
    return {
      sql: `DELETE FROM ${table}${whereCondition}`,
      bindings
    };
  }
  
  _buildWhereClause(where, startIndex = 1) {
    const conditions = [];
    const bindings = [];
    let paramIndex = startIndex;
    
    for (const key in where) {
      conditions.push(`${key} = :${paramIndex++}`);
      bindings.push(where[key]);
    }
    
    return {
      whereClause: conditions.join(' AND '),
      bindings
    };
  }
}

/**
 * Redshift adapter
 */
class RedshiftAdapter extends DatabaseAdapter {
  generateInsertSql(table, columns, params) {
    const paramPlaceholders = columns.map(() => '?').join(', ');
    const bindings = columns.map(col => params[col]);
    
    return {
      sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${paramPlaceholders})`,
      params: bindings
    };
  }
  
  generateSelectSql(table, columns, params, where) {
    // Convert where object to array of conditions and values
    const { whereClause, bindings } = this._buildWhereClause(where);
    const whereCondition = whereClause ? ` WHERE ${whereClause}` : '';
    
    return {
      sql: `SELECT ${columns.join(', ')} FROM ${table}${whereCondition}`,
      params: bindings
    };
  }
  
  generateUpdateSql(table, columns, params, where) {
    // Build set clause
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const setValues = columns.map(col => params[col]);
    
    // Convert where object to array of conditions and values
    const { whereClause, bindings } = this._buildWhereClause(where);
    const whereCondition = whereClause ? ` WHERE ${whereClause}` : '';
    
    return {
      sql: `UPDATE ${table} SET ${setClause}${whereCondition}`,
      params: [...setValues, ...bindings]
    };
  }
  
  generateDeleteSql(table, params, where) {
    // Convert where object to array of conditions and values
    const { whereClause, bindings } = this._buildWhereClause(where);
    const whereCondition = whereClause ? ` WHERE ${whereClause}` : '';
    
    return {
      sql: `DELETE FROM ${table}${whereCondition}`,
      params: bindings
    };
  }
  
  _buildWhereClause(where) {
    const conditions = [];
    const bindings = [];
    
    for (const key in where) {
      conditions.push(`${key} = ?`);
      bindings.push(where[key]);
    }
    
    return {
      whereClause: conditions.join(' AND '),
      bindings
    };
  }
}

/**
 * EventFormatter - Formats event data for various integrations
 */
class EventFormatter {
  constructor() {
    this.logger = new Logger('EventFormatter');
  }
  
  /**
   * Create a detailed rundown of events for a ticket
   * @param {Object} webhookBody - The webhook payload containing events
   * @returns {Promise<string>} - Markdown formatted event summary
   * @throws {Error} If webhook body is invalid
   */
  async createRunDown(webhookBody) {
    if (!webhookBody || !webhookBody.user) {
      this.logger.error('Invalid webhook body in createRunDown - missing user');
      throw new Error('Invalid webhook body: missing user information');
    }

    try {
      this.logger.debug('Creating event rundown', { 
        user: webhookBody.user?.email || webhookBody.user?.id,
        eventName: webhookBody.name
      });
      
      // Email and timestamp extraction with fallbacks
      const email = webhookBody.user?.email ?? webhookBody.user?.id ?? 'Unknown User';
      const timestamp = webhookBody.timestamp ? new Date(webhookBody.timestamp) : new Date();
      const timeStamp = timestamp.toLocaleString();

      // Start building the markdown
      let markdown = `# Event Details\n\n`;
      markdown += `## User: ${email}\n`;
      markdown += `## Time: ${timeStamp}\n\n`;

      // Add event information if available
      if (webhookBody.name) {
        markdown += `## Event Name: ${webhookBody.name}\n\n`;
      }

      // Add session ID if available
      if (webhookBody.properties?.session_id) {
        markdown += `## Session ID: ${webhookBody.properties.session_id}\n\n`;
      }

      // Add session events table if available
      if (webhookBody.events && Array.isArray(webhookBody.events) && webhookBody.events.length > 0) {
        markdown += await this.createEventsTable(webhookBody.events);
      }

      // Add properties section
      if (webhookBody.properties) {
        markdown += `## Properties\n\n`;
        markdown += '```json\n';
        markdown += JSON.stringify(webhookBody.properties, null, 2);
        markdown += '\n```\n\n';
      }

      return markdown;
    } catch (error) {
      this.logger.error('Error creating event rundown:', error);
      throw new Error(`Failed to create event rundown: ${error.message}`);
    }
  }

  /**
   * Create a formatted table of events for a ticket
   * @param {Array} events - List of events from Fullstory
   * @returns {Promise<string>} - Markdown formatted table
   */
  async createEventsTable(events) {
    // Event type to group mapping
    const eventTypeToGroup = {
      dead_click: { group: "User Friction Actions" },
      error_click: { group: "User Friction Actions" },
      form_abandon: { group: "User Friction Actions" },
      mouse_thrash: { group: "User Friction Actions" },
      pinch_gesture: { group: "User Friction Actions" },
      rage_click: { group: "User Friction Actions" },
      refreshed_url: { group: "User Friction Actions" },

      consent: { group: "Native Fullstory Events" },
      custom: { group: "Native Fullstory Events" },
      identify: { group: "Native Fullstory Events" },
      page_properties: { group: "Native Fullstory Events" },

      console_error: { group: "System Friction Actions" },
      crash: { group: "System Friction Actions" },
      network_error: { group: "System Friction Actions" },
      request: { group: "System Friction Actions" },
      exception: { group: "System Friction Actions" },

      background: { group: "System Events" },
      console_message: { group: "System Events" },
      load: { group: "System Events" },
      cumulative_layout_shift: { group: "System Events" },
      navigate: { group: "System Events" },
      low_memory: { group: "System Events" },

      change: { group: "User Actions" },
      click: { group: "User Actions" },
      copy: { group: "User Actions" },
      first_input_delay: { group: "User Actions" },
      element_seen: { group: "User Actions" },
      highlight: { group: "User Actions" },
      keyboard_close: { group: "User Actions" },
      keyboard_open: { group: "User Actions" },
      paste: { group: "User Actions" },
      interaction_to_next_paint: { group: "User Actions" },
      page_view: { group: "User Actions" }
    };

    // Group events by category
    const groupedEvents = this.makeEventsObj(eventTypeToGroup);

    // Organize events into their respective groups
    events.forEach(event => {
      const eventType = event.type?.toLowerCase() ?? 'unknown';
      const group = eventTypeToGroup[eventType]?.group ?? 'Other Events';

      if (!groupedEvents[group]) {
        groupedEvents[group] = [];
      }

      groupedEvents[group].push({
        type: eventType,
        count: event.count || 1,
        data: event.data || {}
      });
    });

    // Generate markdown table
    let markdown = `## Session Events\n\n`;

    for (const [group, groupEvents] of Object.entries(groupedEvents)) {
      if (groupEvents.length === 0) continue;

      markdown += `### ${group}\n\n`;
      markdown += '| Event Type | Count | Details |\n';
      markdown += '|------------|-------|--------|\n';

      groupEvents.forEach(event => {
        const details = Object.keys(event.data).length > 0
          ? JSON.stringify(event.data).substring(0, 50) + '...'
          : 'No additional details';

        markdown += `| ${event.type} | ${event.count} | ${details} |\n`;
      });

      markdown += '\n';
    }

    return markdown;
  }

  /**
   * Initialize event groups structure
   * @param {Object} eventTypeToGroup - Mapping of event types to groups
   * @returns {Object} - Initialized event groups object
   */
  makeEventsObj(eventTypeToGroup) {
    // Get unique groups
    const groups = [...new Set(Object.values(eventTypeToGroup).map(item => item.group))];

    // Initialize group structure
    const groupedEvents = {};
    groups.forEach(group => {
      groupedEvents[group] = [];
    });

    // Add 'Other Events' group for events that don't match known types
    groupedEvents['Other Events'] = [];

    return groupedEvents;
  }

  /**
   * Format a single event for display
   * @param {Object} event - Event object
   * @returns {string} Formatted event string
   */
  formatEvent(event) {
    if (!event) return 'No event data';
    
    const eventType = event.type || 'unknown';
    const timestamp = event.timestamp ? new Date(event.timestamp).toLocaleString() : 'Unknown time';
    
    return `[${timestamp}] ${eventType}`;
  }
}

// Create singleton instances
const warehouse = new Warehouse();
const eventFormatter = new EventFormatter();

// Register with initialization tracker using the service registry with graceful fallback
try {
  // Check if initialization service is available in registry
  if (serviceRegistry.has('initialization')) {
    const initialization = serviceRegistry.get('initialization');
    
    // Log successful initialization
    logger.info('Konbini utilities initialized', {
      warehouse: 'ready',
      eventFormatter: 'ready'
    });
    
    initialization.markInitialized('Konbini', {
      warehouse: 'ready',
      eventFormatter: 'ready'
    });
  } else {
    logger.info('Konbini utilities initialized without tracking');
  }
} catch (error) {
  logger.error('Failed to initialize Konbini module', error);
}

// Export as combined object and individual components
module.exports = {
  warehouse,
  eventFormatter
};