/**
 * MCP Input Validation and Sanitization
 * 
 * Provides robust validation for all MCP tool inputs to prevent:
 * - SQL injection attacks
 * - XSS vulnerabilities  
 * - Path traversal attacks
 * - Command injection
 * - Schema validation bypass
 * - Parameter pollution
 */

import { Logger } from '../../loggerFramework.js';
import config from '../../config.js';

const validationLogger = new Logger('MCP-Validation');

/**
 * Security-focused input validator with sanitization
 */
class InputValidator {
  constructor() {
    // Context-aware validation configurations
    this.contexts = {
      warehouse: {
        name: 'Data Warehouse',
        allowSql: true,
        sqlStrictness: 'moderate', // 'strict', 'moderate', 'permissive'
        xssHandling: 'sanitize',   // 'block', 'sanitize', 'allow'
        pathHandling: 'restricted'  // 'restricted', 'sanitize', 'allow'
      },
      warehouse_admin: {
        name: 'Data Warehouse Admin',
        allowSql: true,
        sqlStrictness: 'permissive', // Only admin mode allows destructive operations
        xssHandling: 'sanitize',
        pathHandling: 'restricted'
      },
      fullstory: {
        name: 'FullStory Analytics',
        allowSql: false,
        sqlStrictness: 'strict',
        xssHandling: 'sanitize', // Allow content but sanitize HTML
        pathHandling: 'restricted'
      },
      system: {
        name: 'System Operations',
        allowSql: false,
        sqlStrictness: 'strict',
        xssHandling: 'block',
        pathHandling: 'sanitize' // Allow paths but prevent traversal
      },
      default: {
        name: 'Default',
        allowSql: false,
        sqlStrictness: 'strict',
        xssHandling: 'sanitize',
        pathHandling: 'restricted'
      }
    };

    // SQL injection patterns - refined for context-aware detection
    this.sqlInjectionPatterns = {
      // Critical injection patterns (always blocked everywhere, including warehouse)
      critical: [
        /('|'')\s*(;|--|\*\/)\s*(union|select|drop|delete|insert|update|or|and)/i,  // Quote + terminator + malicious keyword
        /(union\s+select|union\s+all\s+select)/i, // Union-based injection
        /['"]?1['"]?\s*=\s*['"]?1['"]?/i, // Classic '1'='1' tautology attacks
        /\bor\b.*['"]?1['"]?\s*=\s*['"]?1['"]?/i, // OR-based '1'='1' tautology attacks
        /(exec|execute)\s*\(/i,        // Command execution
        /(sp_|xp_)\w+/i,               // System stored procedures
        /\/\*.*\*\//,                  // SQL comments (suspicious in user input)
        /(%27|%3D)(?![a-fA-F0-9])/i,   // URL encoded quotes/equals (not part of longer encoding)
        /(\\x27|\\x3D)/i               // Hex encoded quotes/equals
      ],
      
      // High-severity patterns (blocked in warehouse context based on strictness)
      high: [
        /\b(\w+)\s*=\s*\1\b/i,         // Tautology (id=id) - word boundaries to prevent false matches
        /\b(drop|truncate|delete|update|create|alter)\s+(table|database|schema|index)/i, // Destructive operations
        /\bupdate\s+\w+\s+set\b/i,     // UPDATE statements (all updates in moderate mode)
        /\bdelete\s+from\s+\w+/i,      // DELETE statements (all deletes in moderate mode)
        /(insert|update|delete).*where.*1\s*=\s*1/i, // Mass operations
      ],

      // Moderate patterns (blocked in strict/moderate contexts)
      moderate: [
        /;\s*(drop|delete|update|insert|create|alter)/i, // Stacked queries
        /(information_schema|sys\.tables|mysql\.user)/i,  // Schema enumeration
        /(waitfor|sleep|benchmark)\s*\(/i,                // Time-based attacks
        /\bor\b.*\b(1\s*=\s*1|true)\b/i,                 // OR-based bypasses
        /(and|or)\s+\w+\s*(like|=)\s*('|").*(%).*('|")/i // Wildcard searches
      ],

      // Basic patterns (only blocked in strict contexts)
      basic: [
        /(select|insert|update|delete|drop|create|alter)\b/i  // Basic SQL keywords
      ]
    };

    // XSS patterns
    this.xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<[^>]*on\w+[^>]*>/gi
    ];

    // Path traversal patterns
    this.pathTraversalPatterns = [
      /(\.\.[\/\\])+/,
      /(\.\.%2f)+/i,
      /(\.\.%5c)+/i,
      /(%2e%2e[\/\\])+/i,
      /(%2e%2e%2f)+/i,  // Fully URL-encoded ../
      /(%2e%2e%5c)+/i   // Fully URL-encoded ..\
    ];

    // Command injection patterns
    this.commandInjectionPatterns = [
      /[;&|`$(){}[\]]/,
      /(^|\s)(cat|ls|dir|type|copy|move|del|rm|mkdir|rmdir|chmod|chown|sudo|su|passwd|ping|curl|wget|nc|netcat)\s/i
    ];

    // Maximum field lengths
    this.maxLengths = {
      string: 10000,
      sql: 50000,
      identifier: 255,
      email: 320,
      url: 2083,
      filename: 255,
      path: 4096
    };
  }

  /**
   * Validate and sanitize tool arguments
   */
  validateToolArguments(toolName, args, schema) {
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitizedArgs: {}
    };

    try {
      if (!args || typeof args !== 'object') {
        validationResult.isValid = false;
        validationResult.errors.push('Arguments must be an object');
        return validationResult;
      }

      // Validate against JSON schema
      const schemaValidation = this._validateSchema(args, schema);
      if (!schemaValidation.isValid) {
        validationResult.isValid = false;
        validationResult.errors.push(...schemaValidation.errors);
      }
      if (schemaValidation.warnings && schemaValidation.warnings.length > 0) {
        validationResult.warnings.push(...schemaValidation.warnings);
      }

      // Security validation and sanitization
      for (const [key, value] of Object.entries(args)) {
        try {
          const sanitized = this._sanitizeValue(key, value, toolName);
          validationResult.sanitizedArgs[key] = sanitized.value;
          
          if (sanitized.warnings.length > 0) {
            validationResult.warnings.push(...sanitized.warnings.map(w => `${key}: ${w}`));
          }
          
          if (sanitized.errors.length > 0) {
            validationResult.isValid = false;
            validationResult.errors.push(...sanitized.errors.map(e => `${key}: ${e}`));
          }
        } catch (error) {
          validationResult.isValid = false;
          validationResult.errors.push(`${key}: Validation error - ${error.message}`);
        }
      }

      // Tool-specific validation
      const toolValidation = this._validateToolSpecific(toolName, validationResult.sanitizedArgs);
      if (!toolValidation.isValid) {
        validationResult.isValid = false;
        validationResult.errors.push(...toolValidation.errors);
      }

      if (validationResult.errors.length > 0) {
        validationLogger.warn(`Validation failed for tool ${toolName}`, {
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          originalArgs: Object.keys(args)
        });
      }

      return validationResult;
    } catch (error) {
      validationLogger.error(`Validation error for tool ${toolName}:`, error);
      return {
        isValid: false,
        errors: [`Validation system error: ${error.message}`],
        warnings: [],
        sanitizedArgs: {}
      };
    }
  }

  /**
   * JSON Schema validation
   */
  _validateSchema(args, schema) {
    const result = { isValid: true, errors: [], warnings: [] };
    
    if (!schema || !schema.properties) {
      return result;
    }

    // Check required fields
    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in args)) {
          result.isValid = false;
          result.errors.push(`Missing required field: ${required}`);
        }
      }
    }

    // Validate each property
    for (const [key, value] of Object.entries(args)) {
      const propertySchema = schema.properties[key];
      if (!propertySchema) {
        // Unknown property - warn but don't fail
        continue;
      }

      const propValidation = this._validateProperty(key, value, propertySchema);
      if (!propValidation.isValid) {
        result.isValid = false;
        result.errors.push(...propValidation.errors);
      }
      if (propValidation.warnings && propValidation.warnings.length > 0) {
        result.warnings.push(...propValidation.warnings);
      }
    }

    return result;
  }

  /**
   * Validate individual property against schema
   */
  _validateProperty(key, value, schema) {
    const result = { isValid: true, errors: [], warnings: [] };

    // Type validation - handle null/undefined gracefully
    if (schema.type && value !== null && value !== undefined) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== schema.type) {
        result.isValid = false;
        result.errors.push(`${key} must be of type ${schema.type}, got ${actualType}`);
        return result;
      }
    } else if (value === null) {
      // Allow null values but note it
      result.warnings.push(`${key} is null`);
      return result; // Skip further validation for null
    } else if (value === undefined) {
      // Allow undefined values but note it  
      result.warnings.push(`${key} is undefined`);
      return result; // Skip further validation for undefined
    }

    // String validation
    if (schema.type === 'string') {
      if (schema.minLength && value.length < schema.minLength) {
        result.isValid = false;
        result.errors.push(`${key} must be at least ${schema.minLength} characters`);
      }
      if (schema.maxLength && value.length > schema.maxLength) {
        result.isValid = false;
        result.errors.push(`${key} must be at most ${schema.maxLength} characters`);
      }
      if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(value)) {
          result.isValid = false;
          result.errors.push(`${key} does not match required pattern`);
        }
      }
      if (schema.enum && !schema.enum.includes(value)) {
        result.isValid = false;
        result.errors.push(`${key} must be one of: ${schema.enum.join(', ')}`);
      }
    }

    // Number validation
    if (schema.type === 'number' || schema.type === 'integer') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        result.isValid = false;
        result.errors.push(`${key} must be at least ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        result.isValid = false;
        result.errors.push(`${key} must be at most ${schema.maximum}`);
      }
    }

    // Array validation
    if (schema.type === 'array') {
      if (schema.minItems && value.length < schema.minItems) {
        result.isValid = false;
        result.errors.push(`${key} must have at least ${schema.minItems} items`);
      }
      if (schema.maxItems && value.length > schema.maxItems) {
        result.isValid = false;
        result.errors.push(`${key} must have at most ${schema.maxItems} items`);
      }
    }

    return result;
  }

  /**
   * Sanitize individual values based on type and context
   */
  _sanitizeValue(key, value, toolName) {
    const result = {
      value: value,
      errors: [],
      warnings: []
    };

    if (value === null || value === undefined) {
      return result;
    }

    // String sanitization
    if (typeof value === 'string') {
      // Length check
      if (value.length > this.maxLengths.string) {
        result.errors.push(`String too long (${value.length} > ${this.maxLengths.string})`);
        return result;
      }

      // Context-aware SQL injection detection for SQL-related fields
      if (this._isSqlField(key, toolName)) {
        const sqlCheck = this._checkSqlInjection(value, toolName);
        if (sqlCheck.blocked) {
          result.errors.push(`SQL injection detected: ${sqlCheck.warnings.join(', ')}`);
          return result;
        }
        if (sqlCheck.suspicious && sqlCheck.warnings.length > 0) {
          result.warnings.push(...sqlCheck.warnings);
        }
      }

      // Context-aware XSS detection
      const xssCheck = this._checkXSS(value, toolName);
      if (xssCheck.shouldBlock) {
        result.errors.push('XSS content blocked by security policy');
        return result;
      }
      if (xssCheck.shouldSanitize) {
        if (xssCheck.dangerous) {
          result.warnings.push('Dangerous XSS content sanitized');
        } else if (xssCheck.suspicious) {
          result.warnings.push('HTML content sanitized');
        }
        result.value = this._sanitizeHtml(value);
      }

      // General encoded attack detection (for all string fields)
      if (typeof value === 'string') {
        const encodedPatterns = [
          /%27|%3D|%3B|%2D%2D/i,  // URL encoded quotes, equals, semicolon, double dash
          /\\x27|\\x3D|\\x3B/i     // Hex encoded quotes, equals, semicolon  
        ];
        
        for (const pattern of encodedPatterns) {
          if (pattern.test(value)) {
            const context = this._getValidationContext(toolName);
            if (!context.allowSql) {
              result.errors.push('Encoded injection pattern detected');
              return result;
            }
            break;
          }
        }
      }

      // Context-aware path traversal detection
      if (this._isPathField(key)) {
        const pathCheck = this._checkPathTraversal(value, toolName);
        if (pathCheck.blocked) {
          result.errors.push(`Path traversal blocked: ${pathCheck.warnings.join(', ')}`);
          return result;
        }
        if (pathCheck.sanitizable) {
          result.warnings.push(...pathCheck.warnings);
          // Sanitize by normalizing path - remove all path traversal patterns
          result.value = value
            .replace(/\.{2,}[\/\\]+/g, '')         // Multiple dots followed by slashes (handles ....// etc.)
            .replace(/(\.\.[\/\\])+/g, '')         // Standard ../  or ..\
            .replace(/(\.\.%2f)+/gi, '')           // ..%2f
            .replace(/(\.\.%5c)+/gi, '')           // ..%5c  
            .replace(/(%2e%2e[\/\\])+/gi, '')      // %2e%2e/ or %2e%2e\
            .replace(/(%2e%2e%2f)+/gi, '')         // %2e%2e%2f
            .replace(/(%2e%2e%5c)+/gi, '');        // %2e%2e%5c
        } else if (pathCheck.warnings.length > 0) {
          result.warnings.push(...pathCheck.warnings);
        }
      }

      // Command injection detection
      if (this._isSystemField(key)) {
        if (this._checkCommandInjection(value)) {
          result.errors.push('Command injection attempt detected');
          return result;
        }
      }

      // URL validation
      if (this._isUrlField(key)) {
        const urlValidation = this._validateUrl(value);
        if (!urlValidation.isValid) {
          result.errors.push(`Invalid URL: ${urlValidation.error}`);
          return result;
        }
      }

      // Email validation (before XSS sanitization for email fields)
      if (this._isEmailField(key)) {
        // Check for XSS content in email first - block it completely
        const xssCheck = this._checkXSS(value, toolName);
        if (xssCheck.dangerous || xssCheck.suspicious) {
          result.errors.push('Invalid email format: contains unsafe content');
          return result;
        }
        
        if (!this._validateEmail(value)) {
          result.errors.push('Invalid email format');
          return result;
        }
      }

      // Identifier validation (database names, table names, etc.)
      if (this._isIdentifierField(key, toolName)) {
        const identifierValidation = this._validateIdentifier(value);
        if (!identifierValidation.isValid) {
          result.errors.push(`Invalid identifier: ${identifierValidation.error}`);
          return result;
        }
      }

      // FullStory ID validation
      if (this._isFullStoryIdField(key, toolName)) {
        const idValidation = this._validateFullStoryId(value);
        if (!idValidation.isValid) {
          result.errors.push(`Invalid user_id format: ${idValidation.error}`);
          return result;
        }
      }
    }

    // Object sanitization
    if (typeof value === 'object' && !Array.isArray(value)) {
      result.value = this._sanitizeObject(value, key, toolName);
    }

    // Array sanitization
    if (Array.isArray(value)) {
      result.value = value.map((item, index) => {
        const itemResult = this._sanitizeValue(`${key}[${index}]`, item, toolName);
        if (itemResult.errors.length > 0) {
          result.errors.push(...itemResult.errors);
        }
        if (itemResult.warnings.length > 0) {
          result.warnings.push(...itemResult.warnings);
        }
        return itemResult.value;
      });
    }

    return result;
  }

  /**
   * Determine validation context based on tool name
   */
  _getValidationContext(toolName) {
    // Check for admin warehouse tools first (most permissive)
    if (toolName.startsWith('warehouse_admin_') || toolName.includes('_admin_')) {
      return this.contexts.warehouse_admin;
    }
    if (toolName.startsWith('warehouse_')) {
      return this.contexts.warehouse;
    }
    if (toolName.startsWith('fullstory_')) {
      return this.contexts.fullstory;
    }
    if (toolName.startsWith('system_')) {
      return this.contexts.system;
    }
    return this.contexts.default;
  }

  /**
   * Context-aware SQL injection detection
   */
  _checkSqlInjection(value, toolName) {
    const result = { suspicious: false, warnings: [], blocked: false };
    const context = this._getValidationContext(toolName);
    
    // Check critical patterns (always blocked everywhere)
    for (const pattern of this.sqlInjectionPatterns.critical) {
      if (pattern.test(value)) {
        result.suspicious = true;
        result.blocked = true;
        result.warnings.push('Critical SQL injection pattern detected');
        return result;
      }
    }
    
    // Check high-severity patterns (warehouse context dependent)
    for (const pattern of this.sqlInjectionPatterns.high) {
      if (pattern.test(value)) {
        result.suspicious = true;
        
        // For warehouse context, handle based on strictness level
        if (context.allowSql && toolName.startsWith('warehouse_')) {
          // Block destructive operations based on strictness level
          const isDestructiveOperation = pattern.source.includes("(drop|truncate|delete|update|create|alter)\\s+(table|database|schema|index)") ||
                                        pattern.source.includes("update.*set") ||
                                        pattern.source.includes("delete.*from") ||
                                        pattern.source.includes("(insert|update|delete).*where.*1\\s*=\\s*1") ||
                                        /\b(drop|delete|truncate|update|create|alter)\b.*\b(table|from|database|schema|index|set)\b/i.test(value);
          
          if (isDestructiveOperation) {
            if (context.sqlStrictness === 'strict') {
              result.blocked = true;
              result.warnings.push('Destructive SQL operations not allowed in strict mode');
              return result;
            } else if (context.sqlStrictness === 'moderate') {
              result.blocked = true;
              result.warnings.push('Destructive SQL operations not allowed in moderate mode - use permissive mode');
              return result;
            } else if (context.sqlStrictness === 'permissive') {
              // Allow destructive operations only in permissive mode
              result.warnings.push('Destructive SQL operation allowed in permissive mode');
            }
          } else {
            // Non-destructive warehouse operations allowed in moderate+ modes
            result.warnings.push('SQL operation detected in warehouse context - allowed');
          }
        } else {
          // Block all high-severity patterns in non-warehouse contexts
          result.blocked = true;
          result.warnings.push('High-severity SQL injection pattern detected');
          return result;
        }
      }
    }

    // Check moderate patterns based on context
    if (context.sqlStrictness === 'strict' || context.sqlStrictness === 'moderate') {
      for (const pattern of this.sqlInjectionPatterns.moderate) {
        if (pattern.test(value)) {
          result.suspicious = true;
          if (context.sqlStrictness === 'strict') {
            result.blocked = true;
          }
          result.warnings.push('Moderate SQL injection pattern detected');
          if (result.blocked) return result;
          break;
        }
      }
    }

    // Check basic patterns only in strict contexts for non-SQL tools
    if (context.sqlStrictness === 'strict' && !context.allowSql) {
      for (const pattern of this.sqlInjectionPatterns.basic) {
        if (pattern.test(value)) {
          result.suspicious = true;
          result.blocked = true;
          result.warnings.push('SQL keywords detected in non-SQL context');
          return result;
        }
      }
    }

    // Additional context-aware heuristics for non-SQL contexts
    if (!context.allowSql) {
      const suspiciousKeywords = ['union', 'select', 'insert', 'update', 'delete', 'drop', 'exec', 'script'];
      const lowerValue = value.toLowerCase();
      const foundKeywords = suspiciousKeywords.filter(keyword => lowerValue.includes(keyword));
      
      if (foundKeywords.length > 1) {
        result.suspicious = true;
        result.blocked = (context.sqlStrictness === 'strict');
        result.warnings.push(`Multiple SQL keywords in non-SQL context: ${foundKeywords.join(', ')}`);
      }
      
      // Check for any SQL keywords in strict non-SQL contexts (like FullStory)
      if (context.sqlStrictness === 'strict' && foundKeywords.length > 0) {
        result.suspicious = true;
        result.blocked = true;
        result.warnings.push(`SQL keywords not allowed in this context: ${foundKeywords.join(', ')}`);
      }
    } else {
      // For SQL-allowed contexts, only flag truly suspicious combinations
      const destructiveKeywords = ['drop', 'delete', 'truncate'];
      const lowerValue = value.toLowerCase();
      const foundDestructive = destructiveKeywords.filter(keyword => lowerValue.includes(keyword));
      
      if (foundDestructive.length > 0 && config.get('node_env') === 'production') {
        result.suspicious = true;
        result.blocked = true;
        result.warnings.push(`Destructive SQL operations not allowed in production: ${foundDestructive.join(', ')}`);
      }
    }

    return result;
  }

  /**
   * Context-aware XSS detection
   */
  _checkXSS(value, toolName) {
    const result = { dangerous: false, suspicious: false, shouldSanitize: false, shouldBlock: false };
    const context = this._getValidationContext(toolName);

    // Always check for dangerous XSS patterns
    for (const pattern of this.xssPatterns) {
      if (pattern.test(value)) {
        result.dangerous = true;
        
        if (context.xssHandling === 'block') {
          result.shouldBlock = true;
        } else {
          result.shouldSanitize = true;
        }
        return result;
      }
    }

    // Check for HTML tags
    if (/<[^>]+>/.test(value)) {
      result.suspicious = true;
      
      switch (context.xssHandling) {
        case 'block':
          result.shouldBlock = true;
          break;
        case 'sanitize':
          result.shouldSanitize = true;
          break;
        case 'allow':
          // Allow HTML content without sanitization
          break;
      }
    }

    return result;
  }

  /**
   * Context-aware path traversal detection
   */
  _checkPathTraversal(value, toolName) {
    const result = { blocked: false, sanitizable: false, warnings: [] };
    const context = this._getValidationContext(toolName);
    
    const hasTraversal = this.pathTraversalPatterns.some(pattern => pattern.test(value));
    
    if (hasTraversal) {
      result.warnings.push('Path traversal pattern detected');
      
      switch (context.pathHandling) {
        case 'restricted':
          result.blocked = true;
          break;
        case 'sanitize':
          result.sanitizable = true;
          break;
        case 'allow':
          // Allow but warn
          break;
      }
    }
    
    return result;
  }

  /**
   * Command injection detection
   */
  _checkCommandInjection(value) {
    return this.commandInjectionPatterns.some(pattern => pattern.test(value));
  }

  /**
   * URL validation
   */
  _validateUrl(value) {
    try {
      const url = new URL(value);
      
      // Only allow safe protocols
      const allowedProtocols = ['http:', 'https:'];
      if (!allowedProtocols.includes(url.protocol)) {
        return { isValid: false, error: 'Protocol not allowed' };
      }

      // Check for suspicious domains
      if (url.hostname === 'localhost' && config.get('node_env') === 'production') {
        return { isValid: false, error: 'Localhost not allowed in production' };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Email validation
   */
  _validateEmail(value) {
    // Allow emails with or without dots in domain (for localhost, etc.)
    const emailRegex = /^[^\s@]+@[^\s@]+(\.[^\s@]+)*$/;
    return emailRegex.test(value) && value.length <= this.maxLengths.email;
  }

  /**
   * Database identifier validation
   */
  _validateIdentifier(value) {
    // Basic SQL identifier rules - allow up to 3 parts (database.schema.table)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*){0,2}$/.test(value)) {
      return { isValid: false, error: 'Invalid identifier format' };
    }

    // Check for too many parts
    const parts = value.split('.');
    if (parts.length > 3) {
      return { isValid: false, error: 'Too many identifier parts (max 3: database.schema.table)' };
    }

    if (value.length > this.maxLengths.identifier) {
      return { isValid: false, error: 'Identifier too long' };
    }

    // Reserved words check
    const reservedWords = ['select', 'insert', 'update', 'delete', 'drop', 'create', 'alter', 'table', 'index'];
    if (reservedWords.includes(value.toLowerCase())) {
      return { isValid: false, error: 'Reserved word not allowed' };
    }

    return { isValid: true };
  }

  /**
   * FullStory ID validation
   */
  _validateFullStoryId(value) {
    // FullStory IDs should be alphanumeric with hyphens/underscores, no special chars
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      return { isValid: false, error: 'contains invalid characters (only letters, numbers, hyphens, underscores allowed)' };
    }

    if (value.length > 100) {
      return { isValid: false, error: 'too long (max 100 characters)' };
    }

    if (value.length < 1) {
      return { isValid: false, error: 'cannot be empty' };
    }

    return { isValid: true };
  }

  /**
   * HTML sanitization
   */
  _sanitizeHtml(value) {
    return value
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Object sanitization
   */
  _sanitizeObject(obj, parentKey, toolName) {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const result = this._sanitizeValue(`${parentKey}.${key}`, value, toolName);
      sanitized[key] = result.value;
    }
    return sanitized;
  }

  /**
   * Tool-specific validation
   */
  _validateToolSpecific(toolName, args) {
    const result = { isValid: true, errors: [] };

    // Warehouse tools - additional SQL validation
    if (toolName.startsWith('warehouse_')) {
      if (args.sql && typeof args.sql === 'string') {
        // Validate SQL length
        if (args.sql.length > this.maxLengths.sql) {
          result.isValid = false;
          result.errors.push(`SQL query too long (${args.sql.length} > ${this.maxLengths.sql})`);
        }

        // Security is handled consistently across all environments by the three-tier model:
        // - Strictness levels (strict/moderate/permissive) control allowed operations
        // - Tool-based permissions (admin vs regular) determine access levels  
        // - Context-aware validation distinguishes column names from SQL operations
        // - SAFE_MODE provides additional safety controls when needed
      }

      // Platform validation
      if (args.platform && !['bigquery', 'snowflake'].includes(args.platform)) {
        result.isValid = false;
        result.errors.push('Invalid platform - must be bigquery or snowflake');
      }
    }

    // FullStory tools - ID validation
    if (toolName.startsWith('fullstory_')) {
      if (args.user_id && typeof args.user_id === 'string') {
        if (!/^[a-zA-Z0-9_-]+$/.test(args.user_id)) {
          result.isValid = false;
          result.errors.push('Invalid user_id format');
        }
      }

      if (args.session_id && typeof args.session_id === 'string') {
        if (!/^[a-zA-Z0-9_-]+$/.test(args.session_id)) {
          result.isValid = false;
          result.errors.push('Invalid session_id format');
        }
      }
    }

    return result;
  }

  // Field type detection helpers
  _isSqlField(key, toolName) {
    return key === 'sql' || key === 'query' || toolName.startsWith('warehouse_');
  }

  _isPathField(key) {
    return ['path', 'file', 'filename', 'directory'].includes(key.toLowerCase());
  }

  _isSystemField(key) {
    return ['command', 'cmd', 'exec', 'shell'].includes(key.toLowerCase());
  }

  _isUrlField(key) {
    return ['url', 'uri', 'link', 'href', 'endpoint'].some(type => key.toLowerCase().includes(type));
  }

  _isEmailField(key) {
    return key.toLowerCase().includes('email') || key.toLowerCase().includes('mail');
  }

  _isIdentifierField(key, toolName) {
    const identifierKeys = ['table', 'database', 'schema', 'column', 'index', 'view'];
    return identifierKeys.some(type => key.toLowerCase().includes(type)) || 
           (toolName.startsWith('warehouse_') && ['target', 'name'].includes(key.toLowerCase()));
  }

  _isFullStoryIdField(key, toolName) {
    const fsIdKeys = ['userid', 'user_id', 'sessionid', 'session_id', 'profileid', 'profile_id'];
    return toolName.startsWith('fullstory_') && 
           fsIdKeys.some(type => key.toLowerCase().includes(type));
  }
}

// Export singleton instance
export const inputValidator = new InputValidator();

/**
 * Validation middleware for MCP tools
 */
export function createValidationWrapper(toolName, schema) {
  return function validateTool(originalFunction) {
    return async function(...args) {
      const [request] = args;
      const { arguments: toolArgs } = request.params;

      // Validate and sanitize arguments
      const validation = inputValidator.validateToolArguments(toolName, toolArgs, schema);

      if (!validation.isValid) {
        validationLogger.error(`Tool ${toolName} validation failed`, {
          errors: validation.errors,
          warnings: validation.warnings
        });
        
        return {
          content: [{
            type: 'text',
            text: `Input validation failed: ${validation.errors.join('; ')}`
          }],
          isError: true,
          _validationErrors: validation.errors
        };
      }

      if (validation.warnings.length > 0) {
        validationLogger.warn(`Tool ${toolName} validation warnings`, {
          warnings: validation.warnings
        });
      }

      // Replace arguments with sanitized version
      const sanitizedRequest = {
        ...request,
        params: {
          ...request.params,
          arguments: validation.sanitizedArgs
        }
      };

      // Call original function with sanitized arguments
      return await originalFunction(sanitizedRequest, ...args.slice(1));
    };
  };
}

export default inputValidator;
