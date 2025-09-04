/**
 * System Tools - MCP Explicit Handler Pattern (JSON Schema, Spec-Compliant)
 * System administration, monitoring, and health check tools
 */

import { Logger } from '../../loggerFramework.js';
import serviceRegistry from '../../serviceRegistry.js';
import initialization from '../../initialization.js';
import os from 'os';
import fs from 'fs';
import { promisify } from 'util';
import { inputValidator } from '../validation/inputValidator.js';

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

// Create logger instance for system tools
const logger = new Logger('SystemTools');

/**
 * Sanitize service details using the existing initialization sanitization logic
 * plus additional MCP-specific sensitive fields
 * @param {Object} details - Service initialization details
 * @returns {Object} Sanitized details
 */
function sanitizeServiceDetails(details) {
  // First use the robust sanitization logic from initialization
  let sanitized = initialization._sanitizeInitDetails(details);
  
  if (!sanitized || typeof sanitized !== 'object') {
    return sanitized;
  }
  
  // Additional fields that are sensitive for MCP tools but not necessarily for logging
  const mcpSensitiveFields = ['datacenter', 'defaultSheet', 'warehouse', 'account'];
  
  // Remove additional MCP-specific sensitive fields
  const finalSanitized = { ...sanitized };
  mcpSensitiveFields.forEach(field => {
    if (field in finalSanitized) {
      delete finalSanitized[field];
    }
  });
  
  return finalSanitized;
}

const systemTools = [
  {
    name: 'system_get_status',
    description: 'System Status',
    inputSchema: {
      type: 'object',
      properties: {
        includeServices: { type: 'boolean', default: true, description: 'Include service registry status' },
        includeEnvironment: { type: 'boolean', default: false, description: 'Include environment variables' },
        includeMemoryDetails: { type: 'boolean', default: true, description: 'Include detailed memory usage' },
      },
      required: [],
    },
  },
  {
    name: 'system_get_metrics',
    description: 'System Metrics',
    inputSchema: {
      type: 'object',
      properties: {
        duration: { type: 'integer', minimum: 1, maximum: 60, default: 5, description: 'Measurement duration in seconds' },
      },
      required: [],
    },
  },
  {
    name: 'system_health_check',
    description: 'System Health Check',
    inputSchema: {
      type: 'object',
      properties: {
        checkServices: { type: 'boolean', default: true, description: 'Check service connectivity' },
        checkDisk: { type: 'boolean', default: true, description: 'Check disk space' },
        checkMemory: { type: 'boolean', default: true, description: 'Check memory usage' },
      },
      required: [],
    },
  },
  {
    name: 'system_get_service_registry',
    description: 'Service Registry',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },


];

async function systemDispatcher(request) {
  const { name, arguments: args } = request.params;
  
  // Find the tool schema for validation
  const toolSchema = systemTools.find(tool => tool.name === name)?.inputSchema;
  
  // Validate and sanitize input arguments
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
  
  // Use sanitized arguments for processing
  const sanitizedArgs = validation.sanitizedArgs;
  
  switch (name) {
    case 'system_get_status': {
      const { includeServices = true, includeEnvironment = false, includeMemoryDetails = true } = sanitizedArgs || {};
      try {
        const status = {
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
          // Sensitive information removed for security
          memory: process.memoryUsage(),
        };
        if (includeMemoryDetails) {
          status.memoryDetails = {
            totalSystemMemory: os.totalmem(),
            freeSystemMemory: os.freemem(),
            usedSystemMemory: os.totalmem() - os.freemem(),
            memoryUsagePercent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2),
            processMemoryPercent: (status.memory.rss / os.totalmem() * 100).toFixed(2)
          };
        }
        status.cpu = {
          // CPU model removed for security
          cores: os.cpus().length,
          loadAverage: os.loadavg(),
          uptime: os.uptime()
        };
        // Network interfaces removed for security
        if (includeServices) {
          status.services = {};
          const services = ['fullstory', 'snowflake', 'bigQuery', 'googleWorkspace'];
          for (const serviceName of services) {
            if (serviceRegistry.has(serviceName)) {
              const service = serviceRegistry.get(serviceName);
              
              // Get initialization details like the main Lexicon does
              let initDetails = {};
              let serviceStatus = service.isConfigured ? 'configured' : 'not_configured';
              
              if (typeof service._initializeConnector === 'function') {
                try {
                  initDetails = await service._initializeConnector() || {};
                  serviceStatus = initDetails.status || serviceStatus;
                } catch (error) {
                  serviceStatus = 'error';
                  initDetails = { error: error.message };
                }
              }
              
              status.services[serviceName] = {
                available: true,
                isConfigured: service.isConfigured || false,
                status: serviceStatus,
                details: sanitizeServiceDetails(initDetails)
              };
            } else {
              status.services[serviceName] = {
                available: false,
                isConfigured: false,
                status: 'not_registered'
              };
            }
          }
        }
        if (includeEnvironment) {
          const envWhitelist = [
            'NODE_ENV', 'PORT', 'HOST', 'TZ', 'LANG', 'PATH',
            'K_SERVICE', 'K_REVISION', 'K_CONFIGURATION',
            'CLOUD_PROVIDER', 'MCP_MODE'
          ];
          status.environment = {};
          envWhitelist.forEach(key => {
            if (process.env[key]) {
              status.environment[key] = process.env[key];
            }
          });
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }]
        };
      } catch (error) {
        logger.error('Error getting system status:', error);
        return {
          content: [{ type: 'text', text: `System status error: ${error.message}` }],
          isError: true
        };
      }
    }
    case 'system_get_metrics': {
      const { duration = 5 } = sanitizedArgs || {};
      try {
        const startTime = Date.now();
        const startCpuUsage = process.cpuUsage();
        const startMemory = process.memoryUsage();
        await new Promise(resolve => setTimeout(resolve, duration * 1000));
        const endTime = Date.now();
        const endCpuUsage = process.cpuUsage(startCpuUsage);
        const endMemory = process.memoryUsage();
        const metrics = {
          timestamp: new Date().toISOString(),
          measurementDuration: duration,
          actualDuration: (endTime - startTime) / 1000,
          cpu: {
            user: endCpuUsage.user / 1000000,
            system: endCpuUsage.system / 1000000,
            total: (endCpuUsage.user + endCpuUsage.system) / 1000000,
            utilization: ((endCpuUsage.user + endCpuUsage.system) / (duration * 1000000)) * 100
          },
          memory: {
            start: startMemory,
            end: endMemory,
            delta: {
              rss: endMemory.rss - startMemory.rss,
              heapUsed: endMemory.heapUsed - startMemory.heapUsed,
              heapTotal: endMemory.heapTotal - startMemory.heapTotal,
              external: endMemory.external - startMemory.external
            }
          },
          system: {
            loadAverage: os.loadavg(),
            freeMemory: os.freemem(),
            totalMemory: os.totalmem(),
            uptime: os.uptime()
          }
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }]
        };
      } catch (error) {
        logger.error('Error getting performance metrics:', error);
        return {
          content: [{ type: 'text', text: `Metrics error: ${error.message}` }],
          isError: true
        };
      }
    }
    case 'system_health_check': {
      const { checkServices = true, checkDisk = true, checkMemory = true } = sanitizedArgs || {};
      try {
        const healthStatus = {
          timestamp: new Date().toISOString(),
          overall: 'healthy',
          checks: {}
        };
        let hasErrors = false;
        let hasWarnings = false;
        if (checkMemory) {
          const memoryUsage = process.memoryUsage();
          const totalMemory = os.totalmem();
          const freeMemory = os.freemem();
          const memoryPercent = ((totalMemory - freeMemory) / totalMemory) * 100;
          healthStatus.checks.memory = {
            status: memoryPercent > 90 ? 'critical' : memoryPercent > 80 ? 'warning' : 'healthy',
            usage: memoryUsage,
            systemMemoryPercent: memoryPercent.toFixed(2),
            processMemoryMB: (memoryUsage.rss / 1024 / 1024).toFixed(2)
          };
          if (healthStatus.checks.memory.status === 'critical') hasErrors = true;
          if (healthStatus.checks.memory.status === 'warning') hasWarnings = true;
        }
        if (checkDisk) {
          try {
            const stats = await stat(process.cwd());
            healthStatus.checks.disk = {
              status: 'healthy',
              // Working directory path removed for security
              accessible: true
            };
          } catch (diskError) {
            healthStatus.checks.disk = {
              status: 'critical',
              error: diskError.message,
              accessible: false
            };
            hasErrors = true;
          }
        }
        if (checkServices) {
          const services = ['fullstory', 'snowflake', 'bigQuery', 'googleWorkspace'];
          healthStatus.checks.services = {};
          for (const serviceName of services) {
            try {
              if (serviceRegistry.has(serviceName)) {
                const service = serviceRegistry.get(serviceName);
                
                // Use the same logic as initialization - check configuration status
                let serviceStatus = 'unknown';
                if (service.isConfigured) {
                  serviceStatus = 'configured';
                } else if (service.isConfigured === false) {
                  serviceStatus = 'not_configured';
                }
                
                // Get additional initialization details if available
                let initDetails = {};
                if (typeof service._initializeConnector === 'function') {
                  try {
                    initDetails = await service._initializeConnector() || {};
                  } catch (error) {
                    serviceStatus = 'error';
                    initDetails = { error: error.message };
                  }
                }
                
                healthStatus.checks.services[serviceName] = {
                  status: serviceStatus === 'configured' ? 'healthy' : serviceStatus === 'not_configured' ? 'warning' : 'critical',
                  isConfigured: service.isConfigured || false,
                  healthCheck: serviceStatus,
                  details: sanitizeServiceDetails(initDetails)
                };
                
                if (healthStatus.checks.services[serviceName].status !== 'healthy') {
                  if (healthStatus.checks.services[serviceName].status === 'critical') {
                    hasErrors = true;
                  } else {
                    hasWarnings = true;
                  }
                }
              } else {
                healthStatus.checks.services[serviceName] = {
                  status: 'warning',
                  isConfigured: false,
                  healthCheck: 'not_registered'
                };
                hasWarnings = true;
              }
            } catch (serviceError) {
              healthStatus.checks.services[serviceName] = {
                status: 'critical',
                error: serviceError.message,
                isConfigured: false
              };
              hasErrors = true;
            }
          }
        }
        const loadAvg = os.loadavg();
        const cpuCount = os.cpus().length;
        const loadPercent = (loadAvg[0] / cpuCount) * 100;
        healthStatus.checks.cpu = {
          status: loadPercent > 90 ? 'critical' : loadPercent > 70 ? 'warning' : 'healthy',
          loadAverage: loadAvg,
          cpuCount: cpuCount,
          loadPercent: loadPercent.toFixed(2)
        };
        if (healthStatus.checks.cpu.status === 'critical') hasErrors = true;
        if (healthStatus.checks.cpu.status === 'warning') hasWarnings = true;
        if (hasErrors) {
          healthStatus.overall = 'critical';
        } else if (hasWarnings) {
          healthStatus.overall = 'warning';
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(healthStatus, null, 2) }]
        };
      } catch (error) {
        logger.error('Error performing health check:', error);
        return {
          content: [{ type: 'text', text: `Health check error: ${error.message}` }],
          isError: true
        };
      }
    }
    case 'system_get_service_registry': {
      try {
        const registryInfo = {
          timestamp: new Date().toISOString(),
          services: {},
          totalServices: 0
        };
        const serviceNames = ['fullstory', 'snowflake', 'bigQuery', 'googleWorkspace'];
        for (const serviceName of serviceNames) {
          if (serviceRegistry.has(serviceName)) {
            const service = serviceRegistry.get(serviceName);
            registryInfo.services[serviceName] = {
              available: true,
              name: service.name || serviceName,
              isConfigured: service.isConfigured || false,
              status: service.status || 'unknown',
              lastInitialized: service.lastInitialized || null,
              // Method names removed for security
            };
            registryInfo.totalServices++;
          } else {
            registryInfo.services[serviceName] = {
              available: false,
              configured: false,
              status: 'not_registered'
            };
          }
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(registryInfo, null, 2) }]
        };
      } catch (error) {
        logger.error('Error getting service registry info:', error);
        return {
          content: [{ type: 'text', text: `Service registry error: ${error.message}` }],
          isError: true
        };
      }
    }


    default:
      return {
        content: [{ type: 'text', text: `Unknown system tool: ${name}` }],
        isError: true
      };
  }
}

export { systemTools, systemDispatcher };
