# MCP OAuth 2.1 Authentication

Lexicon MCP implements OAuth 2.1 authentication according to the [MCP specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization).

## 🔒 Security First

**Authentication is DISABLED by default** - you must explicitly enable and configure it.

This follows the principle that users hosting MCP servers should handle authentication at the infrastructure level (IAM, VPCs, firewalls) unless they specifically need OAuth 2.1 integration.

## Architecture Overview

The authentication system implements:

- **OAuth 2.1** with PKCE (required)
- **Authorization Server Discovery** (RFC 9728)
- **Authorization Server Metadata** (RFC 8414)
- **Dynamic Client Registration** (RFC 7591) - optional
- **Resource Indicators** (RFC 8707) for audience binding
- **Token Audience Validation** to prevent confused deputy attacks

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MCP_AUTH_ENABLED` | No | `false` | Enable OAuth 2.1 authentication |
| `MCP_AUTH_SERVER_URL` | Yes* | - | Authorization server base URL |
| `MCP_SERVER_CANONICAL_URI` | Yes* | - | Canonical URI of this MCP server |
| `MCP_AUTH_CLIENT_ID` | No** | - | OAuth client ID |
| `MCP_AUTH_CLIENT_SECRET` | No | - | OAuth client secret (confidential clients) |
| `MCP_AUTH_ALLOW_DYNAMIC_REGISTRATION` | No | `false` | Allow dynamic client registration |
| `MCP_AUTH_TOKEN_CACHE_TIME` | No | `300` | Token cache time in seconds |
| `MCP_AUTH_REQUIRE_AUDIENCE_VALIDATION` | No | `true` | Enforce token audience validation |
| `MCP_AUTH_MAX_TOKEN_AGE` | No | `3600` | Maximum token age in seconds |
| `MCP_AUTH_RATE_LIMIT_BY_TOKEN` | No | `false` | Rate limit by token instead of IP |

\* Required when `MCP_AUTH_ENABLED=true`  
\*\* Required when dynamic registration is disabled

### Example Configuration

#### Basic OAuth Setup
```bash
# Enable authentication
export MCP_AUTH_ENABLED=true

# Your authorization server
export MCP_AUTH_SERVER_URL=https://auth.example.com

# This MCP server's canonical URI (must match token audience)
export MCP_SERVER_CANONICAL_URI=https://mcp.example.com

# Pre-registered client credentials
export MCP_AUTH_CLIENT_ID=your-client-id
export MCP_AUTH_CLIENT_SECRET=your-client-secret
```

#### Dynamic Registration Setup
```bash
# Enable authentication with dynamic registration
export MCP_AUTH_ENABLED=true
export MCP_AUTH_SERVER_URL=https://auth.example.com
export MCP_SERVER_CANONICAL_URI=https://mcp.example.com

# Allow dynamic client registration (no pre-configured client needed)
export MCP_AUTH_ALLOW_DYNAMIC_REGISTRATION=true
```

## Authorization Flow

### 1. Client Discovery

Clients discover the authorization server via protected resource metadata:

```http
GET /.well-known/oauth-protected-resource HTTP/1.1
Host: mcp.example.com
```

Response:
```json
{
  "resource": "https://mcp.example.com",
  "authorization_servers": ["https://auth.example.com"],
  "jwks_uri": "https://auth.example.com/.well-known/jwks.json",
  "bearer_methods_supported": ["header"]
}
```

### 2. Authorization Server Metadata

Clients fetch authorization server capabilities:

```http
GET /.well-known/oauth-authorization-server HTTP/1.1
Host: mcp.example.com
```

This proxies to the configured authorization server.

### 3. Token Validation

All MCP requests require a valid Bearer token:

```http
POST /mcp HTTP/1.1
Host: mcp.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

## Security Features

### Token Audience Validation

Tokens must include the MCP server's canonical URI in the `aud` claim:

```json
{
  "iss": "https://auth.example.com",
  "aud": ["https://mcp.example.com"],
  "sub": "user123",
  "exp": 1735689600,
  "iat": 1735686000
}
```

This prevents token passthrough attacks and confused deputy vulnerabilities.

### PKCE Enforcement

OAuth 2.1 requires PKCE for all clients. The authorization server must support:
- `code_challenge_methods_supported`: `["S256"]`

### Rate Limiting Integration

When `MCP_AUTH_RATE_LIMIT_BY_TOKEN=true`, rate limiting uses token identity instead of IP address.

## Error Handling

### 401 Unauthorized

Missing or invalid tokens return RFC 9728 compliant responses:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="https://mcp.example.com", 
                  error="invalid_token", 
                  error_description="Token expired",
                  resource="https://mcp.example.com/.well-known/oauth-protected-resource"
Content-Type: application/json

{
  "error": "unauthorized",
  "error_description": "Token expired",
  "metadata_url": "https://mcp.example.com/.well-known/oauth-protected-resource"
}
```

### 403 Forbidden

Invalid scopes or insufficient permissions:

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "insufficient_scope",
  "error_description": "Token lacks required permissions"
}
```

## Implementation Details

### Token Caching

Valid tokens are cached for performance:
- Cache duration: `MCP_AUTH_TOKEN_CACHE_TIME` seconds
- Cache key: SHA-256 hash of token
- Automatic expiry cleanup every 60 seconds

### HTTPS Enforcement

In production (`NODE_ENV=production`):
- Authorization server URLs must use HTTPS
- Redirect URIs must use HTTPS or localhost

### JWT Validation

Current implementation performs basic JWT validation:
- Header/payload parsing
- Expiry time (`exp`) validation  
- Not before time (`nbf`) validation
- Token age validation
- Audience validation

**Note**: This implementation provides basic JWT validation (expiry, audience, structure). For production environments requiring cryptographic signature validation, extend the JWT validation method with JWKS support from your authorization server.

## Testing

### Disable Authentication (Default)

```bash
# Authentication disabled - no tokens required
unset MCP_AUTH_ENABLED
npm run start:mcp
```

### Test with Mock Tokens

```bash
# Enable auth for testing
export MCP_AUTH_ENABLED=true
export MCP_AUTH_SERVER_URL=https://mock-auth.example.com
export MCP_SERVER_CANONICAL_URI=https://localhost:8080
export MCP_AUTH_REQUIRE_AUDIENCE_VALIDATION=false  # For testing only

npm run start:mcp
```

### Integration Tests

Run comprehensive authentication tests:

```bash
npm run test:mcp:auth
```

## Authorization Server Requirements

Your authorization server must support:

1. **OAuth 2.1** with PKCE
2. **Authorization Server Metadata** (RFC 8414)
3. **Resource Indicators** (RFC 8707) - include `resource` parameter
4. **JWKS endpoint** for token verification
5. **Dynamic Client Registration** (RFC 7591) - optional but recommended

### Minimal Token Claims

```json
{
  "iss": "https://your-auth-server.com",
  "aud": ["https://your-mcp-server.com"],
  "sub": "user-identifier",
  "exp": 1735689600,
  "iat": 1735686000,
  "scope": "mcp:read mcp:write"
}
```

## Troubleshooting

### Authentication Disabled

```
✓ MCP Authentication is DISABLED (default)
```

This is the normal state. Users should handle auth at infrastructure level.

### Configuration Errors

```
✗ MCP Auth Configuration Error: MCP_SERVER_CANONICAL_URI is required when authentication is enabled
```

Set all required environment variables when enabling authentication.

### Token Validation Errors

```
✗ Input validation failed: Invalid token audience
```

Ensure tokens include your MCP server's canonical URI in the `aud` claim.

### Authorization Server Unreachable

```
✗ Authorization server metadata error: Failed to fetch metadata: 500 Internal Server Error
```

Check authorization server URL and network connectivity.

## Migration Guide

### From No Authentication

1. Deploy infrastructure-level authentication (recommended)
2. OR enable OAuth 2.1 authentication with proper authorization server

### Enabling OAuth 2.1

1. Set up authorization server with required capabilities
2. Configure environment variables
3. Test with development tokens
4. Deploy with production authorization server

## Security Considerations

- **Never disable audience validation** in production
- **Use HTTPS** for all authorization server communications
- **Implement proper JWKS** validation for production
- **Monitor token validation** logs for suspicious activity
- **Rotate client secrets** regularly
- **Use short-lived tokens** (≤ 1 hour recommended)

## Further Reading

- [MCP Specification - Authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [OAuth 2.1 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [RFC 8707 - Resource Indicators](https://tools.ietf.org/html/rfc8707)
- [RFC 9728 - Protected Resource Metadata](https://tools.ietf.org/html/rfc9728)
