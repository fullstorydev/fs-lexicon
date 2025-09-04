# MCP Security Implementation

Lexicon MCP implements comprehensive security measures including OAuth 2.1 authentication and robust input validation.

## 🔐 Security Architecture

### Defense in Depth

1. **Infrastructure Level** (Recommended Primary)
   - IAM policies
   - VPC network security
   - Firewall rules
   - Load balancer authentication

2. **Application Level** (MCP OAuth 2.1)
   - OAuth 2.1 with PKCE
   - Token audience validation
   - Authorization server discovery
   - Dynamic client registration

3. **Input Level** (Built-in Protection)
   - SQL injection prevention
   - XSS sanitization
   - Path traversal blocking
   - Command injection detection

4. **Rate Limiting** (Per-category)
   - Global MCP rate limits
   - Tool-specific rate limits
   - Token-based rate limiting
   - IP-based rate limiting

## 🚨 Security Principles

### Secure by Default

- **Authentication DISABLED** by default
- **SAFE_MODE** restricts to read-only tools
- **Production restrictions** block dangerous operations
- **HTTPS enforcement** in production environments

### Zero Trust

- **Validate everything** - All inputs validated and sanitized
- **Audience binding** - Tokens bound to specific resources
- **Least privilege** - Minimal required permissions
- **Continuous monitoring** - Security event logging

## 🛡️ Authentication (OAuth 2.1)

### Configuration

```bash
# Enable OAuth 2.1 authentication
export MCP_AUTH_ENABLED=true
export MCP_AUTH_SERVER_URL=https://auth.example.com
export MCP_SERVER_CANONICAL_URI=https://mcp.example.com
export MCP_AUTH_CLIENT_ID=your-client-id
```

### Security Features

- **PKCE Required** - Prevents authorization code interception
- **Audience Validation** - Prevents token passthrough attacks
- **HTTPS Enforcement** - Production requires HTTPS
- **Token Caching** - Performance with security
- **Dynamic Registration** - Optional automated client setup

### Standards Compliance

- OAuth 2.1 (draft-ietf-oauth-v2-1-13)
- RFC 8414 - Authorization Server Metadata
- RFC 7591 - Dynamic Client Registration  
- RFC 9728 - Protected Resource Metadata
- RFC 8707 - Resource Indicators

## 🔍 Input Validation

### Comprehensive Protection

```javascript
// Automatic validation for all tools
const validation = inputValidator.validateToolArguments(toolName, args, schema);
if (!validation.isValid) {
  return { error: validation.errors.join('; '), isError: true };
}
const sanitizedArgs = validation.sanitizedArgs;
```

### Threat Categories

| Threat | Detection | Protection |
|--------|-----------|------------|
| SQL Injection | Pattern matching | Query sanitization |
| XSS | HTML/JS detection | Entity encoding |
| Path Traversal | Directory patterns | Path normalization |
| Command Injection | Shell metacharacters | Command blocking |
| Buffer Overflow | Length validation | Size limits |
| Schema Bypass | JSON validation | Type enforcement |

### Tool-Specific Rules


#### FullStory Tools  
- User/session ID format validation
- Email format validation
- URL scheme validation
- Profile data sanitization

#### System Tools
- Environment variable whitelist
- Path access restrictions
- Memory/CPU limit monitoring
- Service registry protection

## 🚦 Rate Limiting

### Multi-Level Protection

```javascript
// Global MCP rate limiting
app.use(rateLimiter.createMiddleware({
  category: 'mcp',
  windowMs: 60000,     // 1 minute
  maxRequests: 100     // 100 requests per minute
}));

// Tool-specific rate limiting  
const rateLimitCheck = await rateLimiter.checkToolRateLimit(toolName, clientId);
```

### Rate Limit Categories

- **Global MCP** - Overall request limits
- **Tool-specific** - Per-tool usage limits  
- **Authentication** - Token-based limits
- **IP-based** - Network-level limits

## 📊 Security Monitoring

### Logging Events

```javascript
// Authentication events
authLogger.warn('Unauthorized request:', { error, clientId });
authLogger.info('Token validated successfully:', { subject, audience });

// Validation events  
validationLogger.warn('Validation failed:', { tool, errors, warnings });
validationLogger.error('Security threat detected:', { type, pattern, source });

// Rate limiting events
rateLimitLogger.warn('Rate limit exceeded:', { tool, client, limit });
```

### Key Metrics

- Authentication success/failure rates
- Input validation failure patterns
- Rate limit hit frequencies
- Token validation latencies
- Security threat detection counts

### Alert Patterns

```bash
# Critical security events
grep "SQL injection pattern detected" /var/log/lexicon-mcp.log
grep "XSS content detected" /var/log/lexicon-mcp.log  
grep "Path traversal attempt" /var/log/lexicon-mcp.log
grep "Command injection attempt" /var/log/lexicon-mcp.log

# Authentication issues
grep "Token validation failed" /var/log/lexicon-mcp.log
grep "Invalid token audience" /var/log/lexicon-mcp.log
grep "Authorization server unreachable" /var/log/lexicon-mcp.log
```

## ⚙️ Configuration Matrix

### Security Modes

| Mode | Authentication | Validation | Rate Limiting | Use Case |
|------|---------------|------------|---------------|----------|
| **Development** | Disabled | Enabled | Permissive | Local testing |
| **Safe** | Optional | Enabled | Standard | Read-only operations |
| **Production** | Recommended | Strict | Restrictive | Production workloads |
| **High Security** | Required | Paranoid | Aggressive | Sensitive environments |

### Environment Settings

```bash
# Development
export NODE_ENV=development
export MCP_AUTH_ENABLED=false
export SAFE_MODE=false

# Safe Mode
export NODE_ENV=production  
export MCP_AUTH_ENABLED=false
export SAFE_MODE=true

# Production
export NODE_ENV=production
export MCP_AUTH_ENABLED=true
export SAFE_MODE=false
export MCP_AUTH_REQUIRE_AUDIENCE_VALIDATION=true

# High Security
export NODE_ENV=production
export MCP_AUTH_ENABLED=true
export SAFE_MODE=true
export MCP_AUTH_REQUIRE_AUDIENCE_VALIDATION=true
export MCP_AUTH_RATE_LIMIT_BY_TOKEN=true
```

## 🔧 Security Hardening

### Infrastructure Recommendations

1. **Network Security**
   - Deploy behind HTTPS load balancer
   - Use Web Application Firewall (WAF)
   - Implement DDoS protection
   - Restrict network access with VPC

2. **IAM Integration**
   - Use cloud provider IAM for primary auth
   - Implement service accounts with minimal permissions
   - Enable audit logging
   - Rotate credentials regularly

3. **Monitoring & Alerting**
   - Set up security event monitoring
   - Configure real-time threat alerts
   - Implement log aggregation
   - Enable performance monitoring

### Application Security

1. **Authentication**
   - Use HTTPS for all auth server communication
   - Implement token refresh rotation
   - Set short token lifetimes (≤1 hour)
   - Enable audience validation in production

2. **Input Validation**
   - Keep security patterns updated
   - Monitor validation failure rates
   - Implement custom rules for your use case
   - Test with security fuzzing tools

3. **Rate Limiting**
   - Tune limits based on usage patterns
   - Implement sliding window algorithms
   - Use distributed rate limiting for scale
   - Monitor rate limit effectiveness

## 🧪 Security Testing

### Test Categories

1. **Authentication Tests**
   - Token validation edge cases
   - PKCE flow validation
   - Audience binding verification
   - Authorization server integration

2. **Input Validation Tests**
   - SQL injection payloads
   - XSS attack vectors
   - Path traversal attempts
   - Command injection patterns

3. **Rate Limiting Tests**
   - Burst traffic handling
   - Sustained load testing
   - Rate limit bypass attempts
   - Token-based limit validation

### Security Tools

```bash
# Run security test suite
npm run test:security

# SQL injection testing
npm run test:sqli

# XSS testing  
npm run test:xss

# Authentication testing
npm run test:auth

# Rate limiting testing
npm run test:rate-limits
```

## 🚨 Incident Response

### Security Event Response

1. **Detection**
   - Monitor security logs continuously
   - Set up automated alerting
   - Track anomalous patterns
   - Correlate across systems

2. **Assessment**
   - Classify threat severity
   - Identify affected systems
   - Determine blast radius
   - Document timeline

3. **Containment**
   - Block malicious sources
   - Disable compromised tokens
   - Activate additional security measures
   - Preserve forensic evidence

4. **Recovery**
   - Restore affected services
   - Update security configurations
   - Patch vulnerabilities
   - Validate system integrity

### Emergency Procedures

```bash
# Disable authentication in emergency
export MCP_AUTH_ENABLED=false
systemctl restart lexicon-mcp

# Enable safe mode only
export SAFE_MODE=true
systemctl restart lexicon-mcp

# Block specific IP ranges
iptables -A INPUT -s 192.168.1.0/24 -j DROP

# Rotate all tokens immediately
curl -X POST https://auth.example.com/admin/revoke-all-tokens
```

## 📚 Security Resources

### Documentation
- [MCP Authentication Guide](./auth/README.md)
- [Input Validation Guide](./validation/README.md)
- [Rate Limiting Configuration](../RATE_LIMITING.md)

### External References
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OAuth 2.1 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [MCP Security Best Practices](https://modelcontextprotocol.io/specification/2025-06-18/basic/security-best-practices)

### Security Community
- [OWASP Application Security](https://owasp.org/)
- [OAuth Security Research](https://oauth.net/security/)
- [Cloud Security Alliance](https://cloudsecurityalliance.org/)

## 🔄 Security Lifecycle

### Regular Activities

1. **Weekly**
   - Review security logs
   - Update threat patterns
   - Validate rate limits
   - Check authentication metrics

2. **Monthly**  
   - Rotate credentials
   - Update dependencies
   - Review access patterns
   - Test incident response

3. **Quarterly**
   - Security audit
   - Penetration testing
   - Configuration review
   - Training updates

4. **Annually**
   - Comprehensive security assessment
   - Threat model update
   - Disaster recovery testing
   - Security architecture review

---

**Remember**: Security is a shared responsibility between infrastructure and application layers. Use this MCP security implementation as part of a comprehensive defense strategy.
