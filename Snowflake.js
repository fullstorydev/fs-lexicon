/**
 * SnowflakeConnector - Connector for connecting to and querying Snowflake
 * Provides a connection pool and query execution methods
 */
import snowflake from 'snowflake-sdk';
import { createPrivateKey } from "crypto";
import ConnectorBase from './connectorBase.js';
import serviceRegistry from './serviceRegistry.js';

/**
 * Snowflake database connector class
 */
class SnowflakeConnector extends ConnectorBase {
    /**
     * Initialize the Snowflake connector
     */
    constructor() {
        // Call parent constructor with the connector name
        super('Snowflake');
        
        // Configure Snowflake SDK logging level
        snowflake.configure({
            logLevel: 'OFF'
        });
        
        // Initialize the connection property as null
        this.connection = null;
        
        // Store configuration - using validator through the ConnectorBase methods
        this.config = {
            account: this.getConfig('snowflake_account_identifier'),
            username: this.getConfig('snowflake_user'),
            warehouse: this.getConfig('snowflake_warehouse'),
            database: this.getConfig('snowflake_database'),
            schema: this.getConfig('snowflake_schema'),
            privateKey: this.getConfig('snowflake_private_key'),
            privateKeyPassphrase: this.getConfig('snowflake_private_key_passphrase')
        };
        
        // Check if configuration is valid - using validator
        this.isConfigured = this.validator.checkIsConfigured();
    }

    /**
     * Connector-specific initialization logic
     * @returns {Promise<Object>} Initialization result details
     * @protected
     */
    async _initializeConnector() {
        return {
            status: this.isConfigured ? 'configured' : 'not_configured',
            hasDatabase: !!this.config.database,
            hasSchema: !!this.config.schema
        };
    }

    /**
     * Extract private key from encrypted format if needed
     * @param {string} key - Private key in PEM format
     * @param {string} passphrase - Passphrase for encrypted key
     * @returns {string} Extracted private key
     * @private
     */
    _extractPrivateKey(key, passphrase) {
        // Add null/undefined check for the key
        if (!key) {
            this.logger.warn('Private key is null or undefined');
            return null;
        }

        if (!key.startsWith("-----BEGIN ENCRYPTED PRIVATE KEY-----")) {
            // Key is not encrypted, no need to extract anything
            return key;
        }

        try {
            const privateKeyObject = createPrivateKey({
                key,
                format: "pem",
                passphrase,
            });
            
            return privateKeyObject.export({
                format: "pem",
                type: "pkcs8",
            });
        } catch (error) {
            this.logger.error("Error extracting private key:", error);
            throw new Error("Failed to extract private key: " + error.message);
        }
    }

    /**
     * Create a Snowflake connection
     * @returns {Object} Snowflake connection object
     */
    async createConnection() {
        if (!this.isConfigured) {
            return Promise.reject(new Error('Snowflake is not properly configured'));
        }

        try {
            if (this.connection) {
                const isValid = await this.checkConnection();
                if (isValid) {
                    return this.connection;
                }
                
                // Connection exists but isn't valid, destroy it
                await this.disconnect();
            }
            
            // Make sure we have a private key before trying to extract it
            if (!this.config.privateKey) {
                this.logger.error('Missing Snowflake private key');
                throw new Error('Snowflake private key is missing');
            }
            
            const privateKey = this._extractPrivateKey(
                this.config.privateKey, 
                this.config.privateKeyPassphrase
            );
            
            // Check if we successfully got a private key
            if (!privateKey) {
                this.logger.error('Failed to process Snowflake private key');
                throw new Error('Could not process Snowflake private key');
            }
            
            this.connection = snowflake.createConnection({
                account: this.config.account,
                username: this.config.username,
                warehouse: this.config.warehouse,
                database: this.config.database,
                schema: this.config.schema,
                authenticator: 'SNOWFLAKE_JWT',
                privateKey: privateKey
            });
            
            return this.connection;
        } catch (error) {
            this.logger.error("Error creating Snowflake connection:", error);
            throw error;
        }
    }

    /**
     * Connect to Snowflake
     * @returns {Promise<Object>} Connected Snowflake connection
     */
    async connect() {
        if (!this.isConfigured) {
            return Promise.reject(new Error('Snowflake is not properly configured'));
        }

        return new Promise((resolve, reject) => {
            if (!this.connection) {
                reject(new Error("Connection not created. Call createConnection first."));
                return;
            }
            
            this.connection.connect((err, conn) => {
                if (err) {
                    console.error('Error connecting to Snowflake:', err);
                    reject(err);
                    return;
                }
                console.log('Connected to Snowflake!');
                resolve(conn);
            });
        });
    }

    /**
     * Check if the connection is valid
     * @returns {Promise<boolean>} True if connection is valid
     */
    async checkConnection() {
        if (!this.isConfigured) {
            return false;
        }

        try {
            if (!this.connection) {
                return false;
            }
            
            const isConnectionValid = await this.connection.isValidAsync();
            return isConnectionValid;
        } catch (error) {
            console.error('Error checking connection:', error);
            return false;
        }
    }

    /**
     * Execute a SQL query with parameter binding
     * @param {string} sqlText - SQL query text
     * @param {Array|Object} bindings - Parameter bindings
     * @returns {Promise<Array>} Query results
     */
    async executeQuery(sqlText, bindings = []) {
        return this.safeExecute(async () => {
            if (!this.isConfigured) {
                throw new Error('Snowflake is not properly configured');
            }
            
            if (!this.connection) {
                throw new Error("Connection not established. Call connect() first.");
            }
            
            this.logger.info('Executing query:', {
                sqlText,
                bindingsCount: Array.isArray(bindings) ? bindings.length : Object.keys(bindings).length
            });
            
            return new Promise((resolve, reject) => {
                this.connection.execute({
                    sqlText: sqlText,
                    binds: bindings,
                    complete: function(err, stmt, rows) {
                        if (err) {
                            this.logger.error('Failed to execute statement:', err.message);
                            reject(err);
                        } else {
                            this.logger.debug('Successfully executed statement, rows returned:', rows.length);
                            resolve(rows);
                        }
                    }.bind(this)
                });
            });
        }, `executeQuery(${sqlText.substring(0, 30)}...)`, []);
    }

    /**
     * Disconnect from Snowflake
     * @returns {Promise<void>}
     */
    async disconnect() {
        if (!this.isConfigured) {
            return Promise.resolve();
        }

        if (this.connection) {
            return new Promise((resolve) => {
                this.connection.destroy((err) => {
                    if (err) {
                        console.error('Error destroying connection:', err);
                    } else {
                        console.log('Connection destroyed successfully');
                    }
                    this.connection = null;
                    resolve();
                });
            });
        }
    }

    /**
     * Execute an operation with a managed connection lifecycle
     * @param {Function} operation - Async function that takes connector as parameter
     * @returns {Promise<*>} Result of the operation
     */
    async withConnection(operation) {
        return this.safeExecute(async () => {
            if (!this.isConfigured) {
                this.logger.warn('Snowflake operation skipped: not configured');
                return [];
            }

            try {
                await this.createConnection();
                await this.connect();

                const isValid = await this.checkConnection();
                if (!isValid) {
                    throw new Error('Invalid connection');
                }

                const result = await operation(this);
                return result;

            } finally {
                await this.disconnect();
            }
        }, 'withConnection', []);
    }
    
    /**
     * Execute a batch of queries in a transaction
     * @param {Array<{sql: string, bindings: Array|Object}>} queries - Array of query objects
     * @returns {Promise<Array>} Results for each query
     */
    async executeTransaction(queries) {
        return this.safeExecute(async () => {
            if (!this.isConfigured) {
                this.logger.warn('Snowflake transaction skipped: not configured');
                return [];
            }

            return this.withConnection(async (connector) => {
                try {
                    // Begin transaction
                    await connector.executeQuery('BEGIN');
                    
                    // Execute each query
                    const results = [];
                    for (const query of queries) {
                        const result = await connector.executeQuery(query.sql, query.bindings);
                        results.push(result);
                    }
                    
                    // Commit transaction
                    await connector.executeQuery('COMMIT');
                    
                    return results;
                } catch (error) {
                    // Rollback on error
                    try {
                        await connector.executeQuery('ROLLBACK');
                    } catch (rollbackError) {
                        this.logger.error('Error rolling back transaction:', rollbackError);
                    }
                    
                    throw error;
                }
            });
        }, 'executeTransaction', []);
    }
    
    /**
     * Insert multiple rows into a table
     * @param {string} table - Table name
     * @param {Array<Object>} rows - Array of row objects
     * @returns {Promise<Array>} Insert results
     */
    async insertRows(table, rows) {
        return this.safeExecute(async () => {
            if (!this.isConfigured) {
                this.logger.warn('Snowflake insertRows skipped: not configured');
                return [];
            }

            if (!rows || rows.length === 0) {
                return [];
            }
            
            // Get column names from the first row
            const columns = Object.keys(rows[0]);
            
            // Generate parameter placeholders for each row
            const valuePlaceholders = rows.map((_, rowIndex) => {
                const rowPlaceholders = columns.map((_, colIndex) => 
                    `:${rowIndex + 1}_${colIndex + 1}`
                ).join(', ');
                
                return `(${rowPlaceholders})`;
            }).join(', ');
            
            // Construct SQL statement
            const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuePlaceholders}`;
            
            // Create bindings object
            const bindings = {};
            rows.forEach((row, rowIndex) => {
                columns.forEach((col, colIndex) => {
                    bindings[`${rowIndex + 1}_${colIndex + 1}`] = row[col];
                });
            });
            
            return this.withConnection(async (connector) => {
                return await connector.executeQuery(sql, bindings);
            });
        }, `insertRows(${table})`, []);
    }
}

// Create a singleton instance
const snowflakeConnector = new SnowflakeConnector();

// Initialize the connector - ConnectorBase now handles initialization tracking through the service registry
snowflakeConnector.initialize()
  .catch(error => {
    console.error('Error initializing Snowflake connector:', error);
  });

// Register in the service registry
serviceRegistry.register('snowflake', snowflakeConnector);

export default snowflakeConnector;