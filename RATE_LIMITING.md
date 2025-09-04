# Rate Limiting Configuration

This document describes the rate limiting functionality implemented in Lexicon and its MCP plugin.

## Overview

Rate limiting has been implemented across all Lexicon components to protect against abuse and ensure fair usage. The system is fully configurable via environment variables and supports both in-memory and Redis storage backends.

## Architecture

The rate limiting system follows Lexicon's established patterns:

- **Centralized Service**: `rateLimiter.js` provides a singleton service registered in the service registry
- **Configuration System**: Uses Lexicon's centralized `config.js` system for consistent configuration management
- **Middleware Integration**: Rate limiting middleware is integrated into the existing middleware chain
- **Environment Configuration**: All limits are configurable via environment variables with type-safe access
- **Consistent Logging**: Uses Lexicon's logger framework for all rate limiting events

## Environment Variables

### General Rate Limiting

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `RATE_LIMIT_ENABLED` | Enable/disable rate limiting | `true` | `true` |
| `RATE_LIMIT_WINDOW_MS` | General rate limit window in milliseconds | `60000` | `300000` |
| `RATE_LIMIT_MAX_REQUESTS` | General max requests per window | `100` | `200` |

### API-Specific Rate Limiting

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `RATE_LIMIT_API_WINDOW_MS` | API rate limit window | `60000` | `300000` |
| `RATE_LIMIT_API_MAX_REQUESTS` | API max requests per window | `50` | `100` |

### Webhook-Specific Rate Limiting

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `RATE_LIMIT_WEBHOOK_WINDOW_MS` | Webhook rate limit window | `60000` | `300000` |
| `RATE_LIMIT_WEBHOOK_MAX_REQUESTS` | Webhook max requests per window | `200` | `500` |

### MCP-Specific Rate Limiting

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `RATE_LIMIT_MCP_WINDOW_MS` | MCP HTTP rate limit window | `60000` | `300000` |
| `RATE_LIMIT_MCP_MAX_REQUESTS` | MCP HTTP max requests per window | `30` | `60` |

### Tool-Specific Rate Limiting (MCP Mode)

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `RATE_LIMIT_TOOL_WINDOW_MS` | Tool call rate limit window | `60000` | `300000` |
| `RATE_LIMIT_TOOL_MAX_REQUESTS` | Tool call max requests per window | `20` | `50` |

### Storage Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `RATE_LIMIT_USE_REDIS` | Use Redis for storage (vs in-memory) | `false` | `true` |
| `RATE_LIMIT_REDIS_URL` | Redis connection URL | `redis://localhost:6379` | `redis://user:pass@host:6379` |

### Response Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `RATE_LIMIT_SKIP_SUCCESSFUL` | Skip counting successful requests (2xx) | `false` | `true` |
| `RATE_LIMIT_SKIP_FAILED` | Skip counting failed requests (4xx/5xx) | `false` | `true` |
| `RATE_LIMIT_INCLUDE_HEADERS` | Include rate limit headers in responses | `true` | `false` |
| `RATE_LIMIT_TRUST_PROXY` | Trust proxy headers for client IP | `false` | `true` |
| `RATE_LIMIT_MESSAGE` | Custom rate limit message | `Too many requests, please try again later.` | `Rate limit exceeded` |

## Implementation Details

### Main Lexicon Application

Rate limiting is applied to all routes through the middleware chain:

```javascript
// In CloudAdapter initialization
this.middlewares = [
  express.json(),
  middleware.createRateLimit(), // General rate limiting
  middleware.logRequest,
  middleware.verifyWebHook
];
```

### Configuration System Integration

The rate limiter integrates with Lexicon's centralized configuration system:

```javascript
// Rate limiter uses config.js for type-safe configuration access
this.config = {
  enabled: config.getBoolean('rate_limit_enabled', true),
  windowMs: config.getNumber('rate_limit_window_ms', 60000),
  maxRequests: config.getNumber('rate_limit_max_requests', 100),
  useRedis: config.getBoolean('rate_limit_use_redis', false),
  // ... other configuration options
};
```

This ensures:
- **Type Safety**: Automatic type conversion and validation
- **Consistent Defaults**: Centralized default value management
- **Environment Detection**: Automatic environment-specific configuration
- **Configuration Validation**: Built-in validation through the config system

### Webhook Routes

Webhook-specific rate limiting is applied:

```javascript
// In webhookRouter.js
const webhookRateLimit = middleware.createWebhookRateLimit();
this.router.post("/webhook-endpoint", 
  this.jsonParser, 
  webhookRateLimit,
  this.handleWebhook.bind(this)
);
```

### MCP Mode

Two levels of rate limiting in MCP mode:

1. **HTTP Level**: Applied to all MCP HTTP endpoints
2. **Tool Level**: Applied to individual tool calls

```javascript
// HTTP level in mcp-main.js
const mcpRateLimit = rateLimiter.createMiddleware({
  category: 'mcp',
  windowMs: rateLimiter.config.mcpWindowMs,
  maxRequests: rateLimiter.config.mcpMaxRequests
});
app.use(mcpRateLimit);

// Tool level in unifiedDispatcher
const rateLimitCheck = await rateLimiter.checkToolRateLimit(toolName, clientId);
```

## Rate Limit Response Headers

When `RATE_LIMIT_INCLUDE_HEADERS=true`, the following headers are included:

- `X-RateLimit-Limit`: Maximum requests allowed in the window
- `X-RateLimit-Remaining`: Number of requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when the rate limit resets
- `X-RateLimit-Window`: Window size in milliseconds
- `Retry-After`: Seconds to wait before retrying (only when limit exceeded)

## Error Responses

When rate limits are exceeded, the response format is:

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "Too many requests, please try again later.",
  "rateLimitInfo": {
    "limit": 100,
    "remaining": 0,
    "resetTime": 1234567890,
    "retryAfter": 60
  }
}
```

## Monitoring and Observability

All rate limiting events are logged using Lexicon's logger framework:

- **Debug**: Successful rate limit checks
- **Info**: Rate limiter initialization and configuration
- **Warn**: Rate limits exceeded
- **Error**: Rate limiter errors (storage failures, etc.)

Example log entries:

```json
{
  "level": "warn",
  "message": "Rate limit exceeded",
  "clientId": "192.168.1.100",
  "category": "webhook",
  "count": 201,
  "limit": 200,
  "path": "/webhook/slackHook",
  "method": "POST"
}
```

## Production Recommendations

### Environment Settings

For production environments, consider these settings:

```bash
# Enable rate limiting
RATE_LIMIT_ENABLED=true

# General limits (adjust based on your traffic)
RATE_LIMIT_WINDOW_MS=300000  # 5 minutes
RATE_LIMIT_MAX_REQUESTS=500

# Webhook limits (typically higher volume)
RATE_LIMIT_WEBHOOK_WINDOW_MS=60000   # 1 minute
RATE_LIMIT_WEBHOOK_MAX_REQUESTS=1000

# MCP limits (lower volume, more strict)
RATE_LIMIT_MCP_WINDOW_MS=60000      # 1 minute
RATE_LIMIT_MCP_MAX_REQUESTS=100
RATE_LIMIT_TOOL_MAX_REQUESTS=50

# Use Redis for distributed deployments
RATE_LIMIT_USE_REDIS=true
RATE_LIMIT_REDIS_URL=redis://your-redis-cluster:6379

# Trust proxy headers if behind load balancer
RATE_LIMIT_TRUST_PROXY=true

# Include headers for debugging
RATE_LIMIT_INCLUDE_HEADERS=true
```

### Redis Configuration

For high-availability deployments:

- Use Redis Cluster or Redis Sentinel for redundancy
- Configure appropriate Redis memory policies (`allkeys-lru` recommended)
- Monitor Redis memory usage and performance
- Set up Redis persistence based on your requirements

### Monitoring

- Monitor rate limit violation logs for potential abuse
- Set up alerts for high rate limit violation rates
- Track rate limiter performance metrics
- Monitor Redis performance if using Redis storage

## Troubleshooting

### Common Issues

1. **Rate limits too restrictive**: Increase `MAX_REQUESTS` values
2. **Rate limits not working**: Check `RATE_LIMIT_ENABLED=true`
3. **Redis connection issues**: Verify `RATE_LIMIT_REDIS_URL` and Redis availability
4. **Inconsistent limits across instances**: Ensure all instances use Redis with `RATE_LIMIT_USE_REDIS=true`

### Debugging

Enable debug logging to see rate limit checks:

```bash
# For main Lexicon
LOG_LEVEL=debug

# For MCP mode
MCP_DEBUG=true
```

### Reset Rate Limits

To reset rate limits for a specific client:

```javascript
// Via service registry
const rateLimiter = serviceRegistry.get('rateLimiter');
await rateLimiter.resetClientLimits('192.168.1.100', 'webhook');
```

## Cloud Run Resource Requirements

### Memory and CPU Analysis

Based on the rate limiting implementation, **1GB RAM and 1 CPU is sufficient** for most production workloads on Google Cloud Run.

#### Memory Usage Breakdown

**Rate Limiter Storage:**
- Each rate limit entry: ~50 bytes (`{count, resetTime}` + key overhead)
- Key format: `rate_limit:category:clientId` (typically 30-50 characters)
- Automatic cleanup via `setTimeout()` prevents memory leaks

**Memory Estimation:**
```
1000 concurrent clients × 4 categories = 4,000 entries
4,000 entries × 50 bytes = ~200KB for rate limiting data
Total rate limiter overhead: <1MB even with heavy usage
```

#### CPU Usage Analysis

**Rate Limiting Operations:**
- Simple integer arithmetic (increment, comparison)
- `Date.now()` calls and timestamp comparisons  
- JavaScript Map operations (`get`, `set`, `delete`)
- **CPU impact: <1% per request**

#### Configuration Impact on Resources

Your current conservative limits actually reduce resource pressure:

```javascript
// Default limits from rateLimiter.js
maxRequests: 100,        // General: 100/minute
mcpMaxRequests: 30,      // MCP: 30/minute  
toolMaxRequests: 20      // Tools: 20/minute
```

These limits prevent resource exhaustion and maintain consistent performance.

### When You Might Need More Resources

**Scale up to 2GB RAM / 2 CPU if:**
- **High concurrency**: >1,000 simultaneous clients
- **Redis network overhead**: Increased latency with distributed Redis
- **Complex tool operations**: CPU-intensive MCP tool executions
- **Extensive logging**: High-volume debug logging enabled

### Production Monitoring

Monitor these metrics to validate your resource allocation:

```bash
# Memory usage during peak load
gcloud logging read 'resource.type="cloud_run_revision" AND textPayload:"memory"' --limit=50

# CPU utilization patterns  
gcloud logging read 'resource.type="cloud_run_revision" AND textPayload:"cpu"' --limit=50

# Rate limit performance metrics
gcloud logging read 'resource.type="cloud_run_revision" AND jsonPayload.message:"Rate limit"' --limit=100
```

**Key Metrics to Watch:**
- Memory utilization percentage (should stay <80% of allocated)
- CPU utilization during rate limit operations
- Request latency with rate limiting enabled vs disabled
- Rate limit storage cleanup effectiveness (no memory leaks)

### Resource Optimization Tips

**For In-Memory Storage (Development):**
- Memory usage scales linearly with unique client count
- `setTimeout()` cleanup is CPU-efficient
- No network overhead

**For Redis Storage (Production):**
- Offloads memory pressure from Cloud Run instances
- Network calls add minimal CPU overhead
- Enables horizontal scaling across multiple instances

**Cost Optimization:**
- Start with 1GB/1CPU and monitor actual usage
- Scale up only if metrics indicate resource pressure
- Use Cloud Run's automatic scaling to handle traffic bursts

### Implementation Efficiency

The rate limiter is designed for Cloud Run efficiency:

```javascript
// Efficient data structures
const storage = new Map(); // O(1) operations

// Minimal memory footprint per client
const limitData = {
  count: 1,           // 4 bytes
  resetTime: now + windowMs  // 8 bytes  
};

// Automatic cleanup prevents leaks
setTimeout(() => {
  this.storage.delete(key);
}, ttlMs);
```

This implementation ensures that **1GB RAM / 1 CPU is adequate** for typical production deployments while maintaining high performance and cost efficiency.

## Security Considerations

- Rate limiting is applied per client IP address
- Use `RATE_LIMIT_TRUST_PROXY=true` only when behind trusted proxies
- Consider implementing authentication-based rate limiting for API endpoints
- Monitor for attempts to circumvent rate limits (IP rotation, etc.)
- Adjust limits based on your security requirements and traffic patterns

## Future Enhancements

Potential future improvements:

- User/API key-based rate limiting
- Dynamic rate limit adjustment based on system load
- Geographic-based rate limiting
- Rate limiting based on request complexity/cost
- Integration with external threat intelligence
