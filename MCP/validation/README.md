# MCP Input Validation & Security

Lexicon MCP implements comprehensive input validation and sanitization to protect against common security vulnerabilities.

## 🛡️ Security Features

The validation system protects against:

- **SQL Injection** - Pattern detection and query validation
- **XSS Attacks** - HTML/JavaScript sanitization
- **Path Traversal** - Directory traversal prevention
- **Command Injection** - System command detection
- **Schema Bypass** - Strict JSON schema validation
- **Parameter Pollution** - Input normalization
- **Buffer Overflows** - Length validation

## Architecture

### InputValidator Class

Core validation engine with security-focused sanitization:

```javascript
import { inputValidator } from './validation/inputValidator.js';

const validation = inputValidator.validateToolArguments(
  toolName, 
  args, 
  schema
);
```

### Validation Workflow

1. **Schema Validation** - JSON Schema compliance
2. **Security Scanning** - Malicious pattern detection  
3. **Sanitization** - Safe value transformation
4. **Tool-Specific Rules** - Context-aware validation
5. **Error Reporting** - Detailed validation feedback

## Implementation

### Tool Integration

All MCP tools automatically validate inputs:

```javascript
// Tool dispatcher example  
async function toolDispatcher(request) {
  const { name, arguments: args } = request.params;
  
  // Find tool schema
  const toolSchema = fullstoryTools.find(tool => tool.name === name)?.inputSchema;
  
  // Validate and sanitize
  const validation = inputValidator.validateToolArguments(name, args, toolSchema);
  if (!validation.isValid) {
    return {
      content: [{
        type: 'text',
        text: `Input validation failed: ${validation.errors.join('; ')}`
      }],
      isError: true,
      _validationErrors: validation.errors
    };
  }
  
  // Use sanitized arguments
  const sanitizedArgs = validation.sanitizedArgs;
  // ... process with sanitizedArgs
}
```

### Validation Response

```javascript
{
  isValid: boolean,
  errors: string[],
  warnings: string[],
  sanitizedArgs: object
}
```

## Security Rules

### SQL Injection Protection

#### Detection Patterns
- SQL keywords: `union`, `select`, `insert`, `update`, `delete`, `drop`
- Special characters: `;`, `--`, `'`, `"`
- Encoded variants: `%27`, `%3D`, `\\x27`
- Script injection: `script`, `javascript`, `eval`

#### Production Restrictions
In production mode, dangerous SQL operations are blocked:
- `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `CREATE`, `ALTER`

### XSS Prevention

#### Pattern Detection
- Script tags: `<script>`, `<iframe>`
- Event handlers: `onclick`, `onload`, `onerror`
- JavaScript URLs: `javascript:`
- Data URLs: `data:`

#### Sanitization
```javascript
// Input
"<script>alert('xss')</script>Hello"

// Sanitized output  
"&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;Hello"
```

### Path Traversal Protection

#### Blocked Patterns
- `../`, `..\\`
- URL encoded: `%2e%2e/`, `%2e%2e%5c`
- Unicode variants: `%c0%ae%c0%ae/`

```javascript
// Dangerous - blocked
{
  "filename": "../../etc/passwd"
}

// Safe - allowed
{
  "filename": "report.csv"
}
```

### Command Injection Prevention

#### Detected Patterns
- Shell metacharacters: `;`, `|`, `&`, `` ` ``, `$`, `(`, `)`, `{`, `}`
- Common commands: `cat`, `ls`, `rm`, `curl`, `wget`, `nc`

```javascript
// Dangerous - blocked
{
  "command": "list; rm -rf /"
}
```

## Field-Specific Validation

### Database Identifiers

```javascript
// Valid identifiers
"users"
"user_profiles" 
"project.dataset.table"

// Invalid identifiers
"users; DROP TABLE"  // SQL injection
"../etc/passwd"      // Path traversal
"SELECT"             // Reserved word
```

### URLs

```javascript
// Valid URLs
"https://api.example.com/data"
"http://localhost:3000/test"  // Development only

// Invalid URLs  
"javascript:alert('xss')"     // Dangerous protocol
"ftp://malicious.com"         // Blocked protocol
"http://localhost:3000"       // Blocked in production
```

### Email Addresses

```javascript
// Valid
"user@example.com"
"test.email+tag@domain.org"

// Invalid
"invalid-email"
"user@"
"<script>@example.com"
```

## Tool-Specific Rules


### FullStory Tools

```javascript
// ID format validation
userIdPattern = /^[a-zA-Z0-9_-]+$/;
sessionIdPattern = /^[a-zA-Z0-9_-]+$/;

// Profile ID validation
profileIdPattern = /^[a-zA-Z0-9_-]{1,255}$/;
```

### System Tools

```javascript
// Environment variable whitelist
envWhitelist = [
  'NODE_ENV', 'PORT', 'HOST', 'TZ', 'LANG', 'PATH',
  'K_SERVICE', 'K_REVISION', 'K_CONFIGURATION',
  'CLOUD_PROVIDER', 'MCP_MODE'
];
```

## Configuration

### Maximum Lengths

```javascript
maxLengths = {
  string: 10000,      // General strings
  sql: 50000,         // SQL queries
  identifier: 255,    // Database identifiers
  email: 320,         // Email addresses
  url: 2083,          // URLs
  filename: 255,      // Filenames
  path: 4096          // File paths
}
```

### Security Patterns

```javascript
// SQL injection patterns
sqlInjectionPatterns = [
  /('|(\'')|(;)|(--)|(\s*(union|select|insert|update|delete|drop|create|alter|exec|execute|sp_|xp_)\s+)/i,
  /((\%27)|(\%3D)|(\\x27)|(\\x3D))/i,
  /(script|javascript|vbscript|data:)/i,
  /(base64|eval|expression|fromcharcode)/i
];

// XSS patterns  
xssPatterns = [
  /<script[^>]*>.*?<\/script>/gi,
  /<iframe[^>]*>.*?<\/iframe>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<[^>]*on\w+[^>]*>/gi
];
```

## Error Handling

### Validation Failures

```javascript
// Tool response for validation errors
{
  "content": [{
    "type": "text",
    "text": "Input validation failed: SQL injection pattern detected; Invalid email format"
  }],
  "isError": true,
  "_validationErrors": [
    "sql: SQL injection pattern detected",
    "email: Invalid email format"
  ]
}
```

### Warning Messages

```javascript
// Non-blocking warnings
{
  "isValid": true,
  "warnings": [
    "sql: Multiple SQL keywords detected",
    "url: Content contains potentially unsafe HTML"
  ],
  "sanitizedArgs": {
    "sql": "SELECT name FROM users WHERE active = true",
    "url": "&lt;a href=&quot;#&quot;&gt;Link&lt;/a&gt;"
  }
}
```

## Logging

### Security Events

```javascript
// Validation failures
validationLogger.warn('Validation failed for tool fullstory_create_annotation', {
  errors: ['XSS pattern detected'],
  warnings: ['HTML content sanitized'],
  originalArgs: ['text', 'userId', 'sessionId']
});

// System errors
validationLogger.error('Validation system error for tool fullstory_get_user:', error);
```

### Monitoring

Monitor these log patterns for security threats:
- `Validation failed` - Input validation failures
- `SQL injection pattern detected` - Potential SQL injection
- `XSS content detected` - Potential XSS attacks
- `Path traversal attempt` - Directory traversal attempts
- `Command injection attempt` - Command injection attempts

## Testing

### Validation Tests

```javascript
// Test XSS injection detection
const result = inputValidator.validateToolArguments(
  'fullstory_create_annotation',
  { text: "<script>alert('xss')</script>Hello" },
  schema
);
assert.equal(result.isValid, false);
assert.include(result.errors[0], 'XSS');

// Test XSS sanitization
const result = inputValidator.validateToolArguments(
  'fullstory_create_annotation', 
  { text: "<script>alert('xss')</script>Hello" },
  schema
);
assert.equal(result.sanitizedArgs.text, "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;Hello");
```

### Security Test Cases

1. **SQL Injection Vectors**
   - Basic SQL injection
   - Blind SQL injection  
   - Second-order SQL injection
   - NoSQL injection patterns

2. **XSS Payloads**
   - Script tag injection
   - Event handler injection
   - Data URL injection
   - SVG XSS vectors

3. **Path Traversal**
   - Basic directory traversal
   - URL encoded traversal
   - Unicode traversal
   - Null byte injection

4. **Command Injection**
   - Shell metacharacters
   - Command chaining
   - Backtick execution
   - PowerShell injection

## Performance

### Optimization Features

- **Compiled Regex** - Pre-compiled patterns for performance
- **Early Exit** - Stop validation on first critical error
- **Caching** - Cache validation results for repeated inputs
- **Selective Validation** - Skip validation for safe tools in SAFE_MODE

### Benchmarks

- **Simple validation**: ~0.1ms per tool call
- **Complex SQL validation**: ~1-2ms per tool call
- **Large payload validation**: ~5-10ms per tool call

## Best Practices

### For Tool Developers

1. **Use Sanitized Args** - Always use `sanitizedArgs`, never raw `args`
2. **Check Validation** - Handle validation errors gracefully
3. **Log Warnings** - Monitor validation warnings for threats
4. **Test Security** - Include security test cases

### For Operators

1. **Monitor Logs** - Watch for validation failures
2. **Update Patterns** - Keep security patterns current
3. **Tune Limits** - Adjust length limits for your use case
4. **Enable SAFE_MODE** - Use SAFE_MODE for read-only scenarios

## Future Enhancements

- **Machine Learning** - ML-based anomaly detection
- **Custom Rules** - Tool-specific validation rules
- **Rate Limiting** - Per-validation-type rate limits
- **OWASP Integration** - OWASP Core Rule Set patterns
- **Threat Intelligence** - Real-time threat pattern updates

## Related Documentation

- [MCP Authentication](../auth/README.md)
- [Security Best Practices](../docs/SECURITY.md)
- [Tool Development Guide](../docs/TOOLS.md)
