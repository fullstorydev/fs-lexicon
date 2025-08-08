/**
 * Warehouse Tools - MCP Explicit Handler Pattern (JSON Schema, Spec-Compliant)
 * Real data warehouse integration using BigQuery and Snowflake via Konbini
 */

import snowflakeConnector from '../../Snowflake.js';
import googleCloud from '../../GoogleCloud.js';
import konbini from '../../konbini.js';

const warehouseTools = [
  {
    name: 'warehouse_execute_query',
    description: 'Execute Query',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL query to execute' },
        platform: { type: 'string', enum: ['bigquery', 'snowflake'], description: 'Warehouse platform to use' },
        parameters: { type: 'object', description: 'Query parameters for binding' },
        limit: { type: 'integer', minimum: 1, maximum: 10000, default: 1000, description: 'Result limit' },
        format: { type: 'string', enum: ['json', 'csv', 'table'], default: 'json', description: 'Output format' },
        projectId: { type: 'string', description: 'BigQuery project ID (required for BigQuery)' },
        dataset: { type: 'string', description: 'BigQuery dataset (required for BigQuery)' },
      },
      required: ['sql', 'platform'],
    },
  },
  {
    name: 'warehouse_get_table_schema',
    description: 'Get Table Schema',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name (fully qualified: database.schema.table)' },
        platform: { type: 'string', enum: ['bigquery', 'snowflake'], description: 'Warehouse platform' },
        includeStats: { type: 'boolean', default: false, description: 'Include table statistics' },
        projectId: { type: 'string', description: 'BigQuery project ID (required for BigQuery)' },
        dataset: { type: 'string', description: 'BigQuery dataset (required for BigQuery)' },
      },
      required: ['table', 'platform'],
    },
  },
  {
    name: 'warehouse_list_tables',
    description: 'List All Tables',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['bigquery', 'snowflake'], description: 'Warehouse platform' },
        database: { type: 'string', description: 'Database name (required for Snowflake)' },
        schema: { type: 'string', description: 'Schema name (optional filter)' },
        pattern: { type: 'string', description: 'Table name pattern/filter (supports LIKE syntax)' },
        projectId: { type: 'string', description: 'BigQuery project ID (required for BigQuery)' },
        dataset: { type: 'string', description: 'BigQuery dataset (required for BigQuery)' },
      },
      required: ['platform'],
    },
  },
  {
    name: 'warehouse_list_schemas',
    description: 'List All Schemas',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['bigquery', 'snowflake'], description: 'Warehouse platform' },
        database: { type: 'string', description: 'Database name (required for Snowflake)' },
        pattern: { type: 'string', description: 'Schema name pattern/filter' },
        projectId: { type: 'string', description: 'BigQuery project ID (required for BigQuery)' },
        dataset: { type: 'string', description: 'BigQuery dataset (required for BigQuery)' },
      },
      required: ['platform'],
    },
  },
  {
    name: 'warehouse_describe_table',
    description: 'Describe Table',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name (can be fully qualified: database.schema.table)' },
        platform: { type: 'string', enum: ['bigquery', 'snowflake'], description: 'Warehouse platform' },
        includeConstraints: { type: 'boolean', default: true, description: 'Include primary/foreign key constraints' },
        includeSampleData: { type: 'boolean', default: false, description: 'Include sample data (first 5 rows)' },
        projectId: { type: 'string', description: 'BigQuery project ID (required for BigQuery)' },
        dataset: { type: 'string', description: 'BigQuery dataset (required for BigQuery)' },
      },
      required: ['table', 'platform'],
    },
  },
  {
    name: 'warehouse_quick_query',
    description: 'Quick Query',
    inputSchema: {
      type: 'object',
      properties: {
        queryType: { type: 'string', enum: [
          'list_databases', 'list_tables', 'list_schemas', 'table_count', 'table_size',
          'recent_tables', 'table_columns'
        ], description: 'Type of quick query to execute' },
        platform: { type: 'string', enum: ['bigquery', 'snowflake'], description: 'Warehouse platform' },
        target: { type: 'string', description: 'Target object (database, schema, or table name)' },
        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 50, description: 'Limit for results' },
        projectId: { type: 'string', description: 'BigQuery project ID (required for BigQuery)' },
        dataset: { type: 'string', description: 'BigQuery dataset (required for BigQuery)' },
      },
      required: ['queryType', 'platform'],
    },
  },
  {
    name: 'warehouse_quick_query_info',
    description: 'Get information about supported quick query types and their requirements',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['bigquery', 'snowflake', 'redshift', 'all'], default: 'all', description: 'Platform to get query info for' },
        queryType: { type: 'string', description: 'Specific query type to get requirements for' },
      },
      required: [],
    },
  },
  {
    name: 'warehouse_generate_sql',
    description: 'Generate SQL',
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['select', 'insert', 'update', 'delete'], description: 'SQL operation type' },
        table: { type: 'string', description: 'Target table name' },
        platform: { type: 'string', enum: ['bigquery', 'snowflake'], description: 'Target platform for SQL generation' },
        columns: { type: 'array', items: { type: 'string' }, description: 'Columns for SELECT or specific columns for INSERT/UPDATE' },
        where: { type: 'object', description: 'WHERE clause conditions' },
        values: { type: 'object', description: 'Values for INSERT/UPDATE operations' },
        joins: { type: 'array', items: {
          type: 'object',
          properties: {
            table: { type: 'string' },
            type: { type: 'string', enum: ['INNER', 'LEFT', 'RIGHT', 'FULL'], default: 'INNER' },
            on: { type: 'string' }
          },
          required: ['table', 'on']
        }, description: 'JOIN clauses' },
        orderBy: { type: 'array', items: { type: 'string' }, description: 'ORDER BY columns' },
        groupBy: { type: 'array', items: { type: 'string' }, description: 'GROUP BY columns' },
        limit: { type: 'integer', minimum: 1, description: 'LIMIT value' },
      },
      required: ['operation', 'table', 'platform'],
    },
  },
  {
    name: 'warehouse_analytics_query',
    description: 'Analytics Query',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Analytics SQL query' },
        platform: { type: 'string', enum: ['bigquery', 'snowflake'], description: 'Target platform' },
        optimizations: {
          type: 'object',
          properties: {
            cache: { type: 'boolean', default: true, description: 'Enable query caching' },
            parallel: { type: 'boolean', default: true, description: 'Enable parallel execution' },
            approximate: { type: 'boolean', default: false, description: 'Allow approximate results for faster execution' },
          },
          required: [],
          description: 'Query optimization options',
        },
      },
      required: ['query', 'platform'],
    },
  },
  {
    name: 'warehouse_health_check',
    description: 'Warehouse Health Check',
    inputSchema: {
      type: 'object',
      properties: {
        platforms: { type: 'array', items: { type: 'string', enum: ['bigquery', 'snowflake'] }, default: ['bigquery', 'snowflake'], description: 'Platforms to check' },
        detailed: { type: 'boolean', default: false, description: 'Include detailed diagnostics' },
      },
      required: [],
    },
  },
  {
    name: 'warehouse_get_capabilities',
    description: 'Get capabilities and features available for each warehouse platform',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['bigquery', 'snowflake', 'all'], default: 'all', description: 'Platform to check capabilities for' },
      },
      required: [],
    },
  },
  {
    name: 'warehouse_test_connection',
    description: 'Test connectivity and authentication to BigQuery or Snowflake',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['bigquery', 'snowflake'], description: 'Platform to test' },
      },
      required: ['platform'],
    },
  },
];

/**
 * Warehouse Dispatcher - Handles requests for warehouse tools
 * @param {Object} request - The request object
 * @param {string} request.name - The name of the tool to execute
 * @param {Object} request.arguments - The arguments for the tool
 * @returns {Object} - The response object
 */
async function warehouseDispatcher(request) {
  const { name, arguments: args } = request.params;
  if (SAFE_MODE && !SAFE_TOOL_NAMES.includes(name)) {
    return {
      content: [{ type: 'text', text: `This tool is not available in SAFE_MODE: ${name}` }],
      isError: true,
    };
  }
  switch (name) {
    case 'warehouse_execute_query': {
      const { sql, platform, parameters = {}, limit = 1000, format = 'json', projectId, dataset } = args || {};
      if (!sql || !platform) {
        return { content: [{ type: 'text', text: 'Missing required parameter: sql and/or platform.' }], isError: true };
      }
      if (platform === 'bigquery' && (!projectId || !dataset)) {
        return { content: [{ type: 'text', text: 'Missing required parameter: projectId and/or dataset for BigQuery.' }], isError: true };
      }
      try {
        let results;
        if (platform === 'snowflake') {
          results = await snowflakeConnector.executeQuery(sql, parameters, limit);
        } else if (platform === 'bigquery') {
          results = await googleCloud.bigQuery.createQueryJob(sql, parameters, { maxResults: limit, projectId, dataset });
        } else {
          return { content: [{ type: 'text', text: `Unsupported platform: ${platform}` }], isError: true };
        }
        const formattedResults = formatQueryResults(results, format);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ platform, query: sql, parameters, limit, format, projectId, dataset, results: formattedResults, executedAt: new Date().toISOString() }, null, 2)
          }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `Query execution failed on ${platform}: ${error.message}` }], isError: true };
      }
    }
    case 'warehouse_get_table_schema': {
      const { table, platform, includeStats = false, projectId, dataset } = args || {};
      if (!table || !platform) {
        return { content: [{ type: 'text', text: 'Missing required parameter: table and/or platform.' }], isError: true };
      }
      if (platform === 'bigquery' && (!projectId || !dataset)) {
        return { content: [{ type: 'text', text: 'Missing required parameter: projectId and/or dataset for BigQuery.' }], isError: true };
      }
      try {
        let sql, params = {};
        if (platform === 'bigquery') {
          // Ensure fully qualified table name is passed as target
          let fqTable = table;
          if (projectId && dataset && table && table.split('.').length !== 3) {
            fqTable = `${projectId}.${dataset}.${table}`;
          }
          ({ sql, params } = konbini.quickQueries.generateQuery({ queryType: 'table_columns', platform, target: fqTable, projectId, dataset }));
          const results = await googleCloud.bigQuery.createQueryJob(sql, params, { projectId, dataset });
          return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
        } else if (platform === 'snowflake') {
          ({ sql, params } = konbini.quickQueries.generateQuery({ queryType: 'table_columns', platform, target: table }));
          const results = await snowflakeConnector.executeQuery(sql, params, 1000);
          return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
        } else {
          return { content: [{ type: 'text', text: `Unsupported platform: ${platform}` }], isError: true };
        }
      } catch (error) {
        return { content: [{ type: 'text', text: `Schema retrieval failed: ${error.message}` }], isError: true };
      }
    }
    case 'warehouse_list_tables': {
      const { platform, database, schema, pattern, limit = 1000, projectId, dataset } = args || {};
      if (!platform) {
        return { content: [{ type: 'text', text: 'Missing required parameter: platform.' }], isError: true };
      }
      if (platform === 'bigquery' && (!projectId || !dataset)) {
        return { content: [{ type: 'text', text: 'Missing required parameter: projectId and/or dataset for BigQuery.' }], isError: true };
      }
      if (platform === 'bigquery' && !database) {
        return { content: [{ type: 'text', text: 'Missing required parameter: database (dataset) for BigQuery.' }], isError: true };
      }
      try {
        let sql, params = {};
        if (platform === 'bigquery') {
          ({ sql, params } = konbini.quickQueries.generateQuery({ queryType: 'list_tables', platform, target: database, limit, pattern, projectId, dataset }));
          const results = await googleCloud.bigQuery.createQueryJob(sql, params, { maxResults: limit, projectId, dataset });
          const formattedResults = formatQueryResults({ rows: results }, 'table');
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ platform, database, schema, pattern, projectId, dataset, results: formattedResults, executedAt: new Date().toISOString() }, null, 2)
            }]
          };
        } else if (platform === 'snowflake') {
          ({ sql, params } = konbini.quickQueries.generateQuery({ queryType: 'list_tables', platform, target: database, limit, pattern }));
          const results = await snowflakeConnector.executeQuery(sql, params, limit);
          const formattedResults = formatQueryResults({ rows: results }, 'table');
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ platform, database, schema, pattern, results: formattedResults, executedAt: new Date().toISOString() }, null, 2)
            }]
          };
        } else {
          return { content: [{ type: 'text', text: `Unsupported platform: ${platform}` }], isError: true };
        }
      } catch (error) {
        return { content: [{ type: 'text', text: `Failed to list tables: ${error.message}` }], isError: true };
      }
    }
    case 'warehouse_list_schemas': {
      const { platform, database, pattern, limit = 1000, projectId, dataset } = args || {};
      if (!platform) {
        return { content: [{ type: 'text', text: 'Missing required parameter: platform.' }], isError: true };
      }
      if (platform === 'bigquery' && (!projectId || !dataset)) {
        return { content: [{ type: 'text', text: 'Missing required parameter: projectId and/or dataset for BigQuery.' }], isError: true };
      }
      if (platform === 'bigquery' && !database) {
        return { content: [{ type: 'text', text: 'Missing required parameter: database (dataset) for BigQuery.' }], isError: true };
      }
      try {
        let sql, params = {};
        if (platform === 'bigquery') {
          ({ sql, params } = konbini.quickQueries.generateQuery({ queryType: 'list_schemas', platform, target: database, limit, pattern, projectId, dataset }));
          const results = await googleCloud.bigQuery.createQueryJob(sql, params, { maxResults: limit, projectId, dataset });
          const formattedResults = formatQueryResults({ rows: results }, 'table');
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ platform, database, pattern, projectId, dataset, results: formattedResults, executedAt: new Date().toISOString() }, null, 2)
            }]
          };
        } else if (platform === 'snowflake') {
          ({ sql, params } = konbini.quickQueries.generateQuery({ queryType: 'list_schemas', platform, target: database, limit, pattern }));
          const results = await snowflakeConnector.executeQuery(sql, params, limit);
          const formattedResults = formatQueryResults({ rows: results }, 'table');
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ platform, database, pattern, results: formattedResults, executedAt: new Date().toISOString() }, null, 2)
            }]
          };
        } else {
          return { content: [{ type: 'text', text: `Unsupported platform: ${platform}` }], isError: true };
        }
      } catch (error) {
        return { content: [{ type: 'text', text: `Failed to list schemas: ${error.message}` }], isError: true };
      }
    }
    case 'warehouse_describe_table': {
      const { table, platform, includeConstraints = true, includeSampleData = false, projectId, dataset } = args || {};
      if (!table || !platform) {
        return { content: [{ type: 'text', text: 'Missing required parameter: table and/or platform.' }], isError: true };
      }
      if (platform === 'bigquery' && (!projectId || !dataset)) {
        return { content: [{ type: 'text', text: 'Missing required parameter: projectId and/or dataset for BigQuery.' }], isError: true };
      }
      try {
        let sql, params = {};
        if (platform === 'bigquery') {
          ({ sql, params } = konbini.quickQueries.generateQuery({ queryType: 'table_columns', platform, target: table, projectId, dataset }));
          const results = await googleCloud.bigQuery.createQueryJob(sql, params, { projectId, dataset });
          return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
        } else if (platform === 'snowflake') {
          ({ sql, params } = konbini.quickQueries.generateQuery({ queryType: 'table_columns', platform, target: table }));
          const results = await snowflakeConnector.executeQuery(sql, params, 1000);
          return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
        } else {
          return { content: [{ type: 'text', text: `Unsupported platform: ${platform}` }], isError: true };
        }
      } catch (error) {
        return { content: [{ type: 'text', text: `Failed to describe table: ${error.message}` }], isError: true };
      }
    }
    case 'warehouse_quick_query': {
      const { queryType, platform, target, limit = 50, pattern, projectId, dataset } = args || {};
      if (!queryType || !platform) {
        return { content: [{ type: 'text', text: 'Missing required parameter: queryType and/or platform.' }], isError: true };
      }
      if (platform === 'bigquery' && ['list_tables', 'list_schemas'].includes(queryType) && (!target || !projectId || !dataset)) {
        return { content: [{ type: 'text', text: `Missing required parameter: target (dataset), projectId and/or dataset for ${queryType} on BigQuery.` }], isError: true };
      }
      try {
        const { sql, params } = konbini.quickQueries.generateQuery({ queryType, platform, target, limit, pattern, projectId, dataset });
        let results;
        if (platform === 'snowflake') {
          results = await snowflakeConnector.executeQuery(sql, params, limit);
        } else if (platform === 'bigquery') {
          results = await googleCloud.bigQuery.createQueryJob(sql, params, { maxResults: limit, projectId, dataset });
        } else {
          return { content: [{ type: 'text', text: `Unsupported platform: ${platform}` }], isError: true };
        }
        const formattedResults = formatQueryResults({ rows: results }, 'table');
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ queryType, platform, target, sql, projectId, dataset, results: formattedResults, rowCount: Array.isArray(results) ? results.length : 0, executedAt: new Date().toISOString(), generatedBy: 'Konbini QuickQueries' }, null, 2)
          }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `Quick query failed: ${error.message}` }], isError: true };
      }
    }
    case 'warehouse_quick_query_info': {
      const { platform = 'all', queryType } = args || {};
      try {
        const supportedTypes = konbini.quickQueries.getSupportedQueryTypes();
        if (queryType) {
          const info = supportedTypes.find(q => q.name === queryType && (platform === 'all' || q.platform === platform));
          return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
        } else {
          const filtered = platform === 'all' ? supportedTypes : supportedTypes.filter(q => q.platform === platform);
          return { content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }] };
        }
      } catch (error) {
        return { content: [{ type: 'text', text: `Failed to get query info: ${error.message}` }], isError: true };
      }
    }
    case 'warehouse_generate_sql': {
      const { operation, table, platform, columns, where, values, joins, orderBy, groupBy, limit } = args || {};
      if (!operation || !table || !platform) {
        return { content: [{ type: 'text', text: 'Missing required parameter: operation, table, and/or platform.' }], isError: true };
      }
      try {
        const adapter = konbini.warehouse.getAdapter({ databaseType: platform });
        let sql;
        // You may want to implement more logic here for each operation
        sql = adapter.generateSQL({ operation, table, columns, where, values, joins, orderBy, groupBy, limit });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ platform, operation, table, generatedSQL: sql, adapter: adapter.constructor.name, timestamp: new Date().toISOString() }, null, 2)
          }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `SQL generation failed: ${error.message}` }], isError: true };
      }
    }
    case 'warehouse_analytics_query': {
      const { query, platform, optimizations } = args || {};
      if (!query || !platform) {
        return { content: [{ type: 'text', text: 'Missing required parameter: query and/or platform.' }], isError: true };
      }
      try {
        let results;
        const startTime = Date.now();
        if (platform === 'snowflake') {
          results = await snowflakeConnector.executeQuery(query, {}, 1000, optimizations);
        } else if (platform === 'bigquery') {
          results = await googleCloud.bigQuery.executeQuery(query, {}, 1000, optimizations);
        } else {
          return { content: [{ type: 'text', text: `Unsupported platform: ${platform}` }], isError: true };
        }
        const executionTime = Date.now() - startTime;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ platform, query, optimizations, results, performance: { executionTimeMs: executionTime, rowCount: results.rows?.length || 0, optimized: true }, executedAt: new Date().toISOString() }, null, 2)
          }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `Analytics query failed: ${error.message}` }], isError: true };
      }
    }
    case 'warehouse_health_check': {
      const { platforms = ['bigquery', 'snowflake'], detailed = false } = args || {};
      try {
        const healthChecks = {};
        for (const platform of platforms) {
          try {
            if (platform === 'snowflake') {
              healthChecks[platform] = await snowflakeConnector.healthCheck(detailed);
            } else if (platform === 'bigquery') {
              healthChecks[platform] = await googleCloud.bigQuery.healthCheck(detailed);
            } else {
              healthChecks[platform] = { healthy: false, error: 'Unsupported platform' };
            }
          } catch (error) {
            healthChecks[platform] = { healthy: false, error: error.message };
          }
        }
        const overallHealth = Object.values(healthChecks).every(check => check.healthy);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ overallHealth, platforms: healthChecks, konbiniAvailable: !!konbini, checkedAt: new Date().toISOString() }, null, 2)
          }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `Warehouse health check failed: ${error.message}` }], isError: true };
      }
    }
    case 'warehouse_get_capabilities': {
      const { platform = 'all' } = args || {};
      try {
        const capabilities = {};
        const platformsToCheck = platform === 'all' ? ['bigquery', 'snowflake'] : [platform];
        for (const plt of platformsToCheck) {
          if (plt === 'snowflake') {
            capabilities[plt] = await snowflakeConnector.getCapabilities();
          } else if (plt === 'bigquery') {
            capabilities[plt] = await googleCloud.bigQuery.getCapabilities();
          } else {
            capabilities[plt] = { supported: false, error: 'Unsupported platform' };
          }
        }
        return { content: [{ type: 'text', text: JSON.stringify(capabilities, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Failed to get warehouse capabilities: ${error.message}` }], isError: true };
      }
    }
    case 'warehouse_test_connection': {
      const { platform } = args || {};
      if (!platform) {
        return { content: [{ type: 'text', text: 'Missing required parameter: platform.' }], isError: true };
      }
      try {
        let result;
        if (platform === 'snowflake') {
          result = await snowflakeConnector.testConnection();
        } else if (platform === 'bigquery') {
          result = await googleCloud.bigQuery.testConnection();
        } else {
          return { content: [{ type: 'text', text: `Unsupported platform: ${platform}` }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Warehouse test connection failed: ${error.message}` }], isError: true };
      }
    }
    default:
      return {
        content: [{ type: 'text', text: `Warehouse tool '${name}' not implemented.` }],
        isError: true
      };
  }
}

// --- SAFE_MODE logic ---
const SAFE_MODE = process.env.SAFE_MODE === 'true';
const SAFE_TOOL_NAMES = [
  'warehouse_get_table_schema',
  'warehouse_list_tables',
  'warehouse_list_schemas',
  'warehouse_describe_table',
  'warehouse_health_check',
  'warehouse_get_capabilities',
  'warehouse_test_connection',
  // Add any other read-only/reporting tools here
];
const exportedWarehouseTools = SAFE_MODE
  ? warehouseTools.filter(tool => SAFE_TOOL_NAMES.includes(tool.name))
  : warehouseTools;

/**
 * Format query results based on requested format
 * @private
 */
function formatQueryResults(results, format) {
  if (!results || !results.rows) {
    return results;
  }
  
  switch (format) {
    case 'csv':
      if (results.rows.length === 0) return '';
      
      const headers = Object.keys(results.rows[0]);
      const csvRows = [
        headers.join(','),
        ...results.rows.map(row => 
          headers.map(header => {
            const value = row[header];
            return typeof value === 'string' && value.includes(',') 
              ? `"${value.replace(/"/g, '""')}"` 
              : value;
          }).join(',')
        )
      ];
      return csvRows.join('\n');
      
    case 'table':
      if (results.rows.length === 0) return 'No data returned';
      
      const keys = Object.keys(results.rows[0]);
      const maxLengths = keys.reduce((acc, key) => {
        acc[key] = Math.max(
          key.length,
          ...results.rows.map(row => String(row[key] || '').length)
        );
        return acc;
      }, {});
      
      const separator = keys.map(key => '-'.repeat(maxLengths[key])).join(' | ');
      const header = keys.map(key => key.padEnd(maxLengths[key])).join(' | ');
      const rows = results.rows.map(row =>
        keys.map(key => String(row[key] || '').padEnd(maxLengths[key])).join(' | ')
      );
      
      return [header, separator, ...rows].join('\n');
      
    case 'json':
    default:
      return results;
  }
}

export { exportedWarehouseTools as warehouseTools, warehouseDispatcher };
