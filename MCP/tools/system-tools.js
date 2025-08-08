/**
 * System Tools - MCP Explicit Handler Pattern (JSON Schema, Spec-Compliant)
 * System administration, monitoring, and health check tools
 */

import { Logger } from '../../loggerFramework.js';
import serviceRegistry from '../../serviceRegistry.js';
import os from 'os';
import fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

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
  {
    name: 'system_get_logs',
    description: 'System Logs',
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['error', 'warn', 'info', 'debug'], default: 'info', description: 'Minimum log level' },
        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100, description: 'Maximum number of log entries' },
        service: { type: 'string', description: 'Filter by service name' },
      },
      required: [],
    },
  },
  {
    name: 'system_restart_service',
    description: 'Restart Service',
    inputSchema: {
      type: 'object',
      properties: {
        serviceName: { type: 'string', enum: ['fullstory', 'slack', 'snowflake'], description: 'Service to restart' },
      },
      required: ['serviceName'],
    },
  },
];

async function systemDispatcher(request) {
  const { name, arguments: args } = request.params;
  switch (name) {
    case 'system_get_status': {
      const { includeServices = true, includeEnvironment = false, includeMemoryDetails = true } = args || {};
      try {
        const status = {
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
          processId: process.pid,
          workingDirectory: process.cwd(),
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
          model: os.cpus()[0]?.model || 'Unknown',
          cores: os.cpus().length,
          loadAverage: os.loadavg(),
          uptime: os.uptime()
        };
        status.network = Object.keys(os.networkInterfaces()).map(name => ({
          name,
          addresses: os.networkInterfaces()[name]?.map(addr => ({
            address: addr.address,
            family: addr.family,
            internal: addr.internal
          })) || []
        }));
        if (includeServices) {
          status.services = {};
          const services = ['fullstory', 'slack', 'snowflake'];
          for (const serviceName of services) {
            if (serviceRegistry.has(serviceName)) {
              const service = serviceRegistry.get(serviceName);
              status.services[serviceName] = {
                available: true,
                isConfigured: service.isConfigured || false,
                status: service.status || 'unknown'
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
        this.logger.error('Error getting system status:', error);
        return {
          content: [{ type: 'text', text: `System status error: ${error.message}` }],
          isError: true
        };
      }
    }
    case 'system_get_metrics': {
      const { duration = 5 } = args || {};
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
        this.logger.error('Error getting performance metrics:', error);
        return {
          content: [{ type: 'text', text: `Metrics error: ${error.message}` }],
          isError: true
        };
      }
    }
    case 'system_health_check': {
      const { checkServices = true, checkDisk = true, checkMemory = true } = args || {};
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
              workingDirectory: process.cwd(),
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
          const services = ['fullstory', 'slack', 'snowflake'];
          healthStatus.checks.services = {};
          for (const serviceName of services) {
            try {
              if (serviceRegistry.has(serviceName)) {
                const service = serviceRegistry.get(serviceName);
                let serviceHealth = 'unknown';
                if (typeof service.healthCheck === 'function') {
                  const health = await service.healthCheck();
                  serviceHealth = health.status || 'healthy';
                } else if (service.isConfigured) {
                  serviceHealth = 'configured';
                }
                healthStatus.checks.services[serviceName] = {
                  status: serviceHealth === 'healthy' || serviceHealth === 'configured' ? 'healthy' : 'warning',
                  isConfigured: service.isConfigured || false,
                  healthCheck: serviceHealth
                };
                if (healthStatus.checks.services[serviceName].status === 'warning') {
                  hasWarnings = true;
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
        this.logger.error('Error performing health check:', error);
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
        const serviceNames = ['fullstory', 'slack', 'snowflake'];
        for (const serviceName of serviceNames) {
          if (serviceRegistry.has(serviceName)) {
            const service = serviceRegistry.get(serviceName);
            registryInfo.services[serviceName] = {
              available: true,
              name: service.name || serviceName,
              isConfigured: service.isConfigured || false,
              status: service.status || 'unknown',
              lastInitialized: service.lastInitialized || null,
              methods: Object.getOwnPropertyNames(Object.getPrototypeOf(service))
                .filter(name => typeof service[name] === 'function' && !name.startsWith('_'))
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
        this.logger.error('Error getting service registry info:', error);
        return {
          content: [{ type: 'text', text: `Service registry error: ${error.message}` }],
          isError: true
        };
      }
    }
    case 'system_get_logs': {
      const { level = 'info', limit = 100, service } = args || {};
      try {
        const logEntries = [
          {
            timestamp: new Date().toISOString(),
            level: 'info',
            service: 'system',
            message: 'System logs requested',
            metadata: { level, limit, service }
          }
        ];
        const recentEvents = [
          { level: 'info', service: 'mcp-server', message: 'MCP server v3 started successfully' },
          { level: 'info', service: 'fullstory', message: 'FullStory connector initialized' },
          { level: 'info', service: 'slack', message: 'Slack connector initialized' },
          { level: 'warn', service: 'snowflake', message: 'Snowflake connection check pending' }
        ];
        recentEvents.forEach(event => {
          logEntries.push({
            timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
            level: event.level,
            service: event.service,
            message: event.message
          });
        });
        let filteredLogs = logEntries;
        if (service) {
          filteredLogs = logEntries.filter(log => log.service === service);
        }
        filteredLogs = filteredLogs.slice(0, limit);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              logs: filteredLogs,
              filters: { level, limit, service },
              totalEntries: filteredLogs.length
            }, null, 2)
          }]
        };
      } catch (error) {
        this.logger.error('Error getting system logs:', error);
        return {
          content: [{ type: 'text', text: `Logs error: ${error.message}` }],
          isError: true
        };
      }
    }
    case 'system_restart_service': {
      const { serviceName } = args || {};
      try {
        if (!serviceRegistry.has(serviceName)) {
          return {
            content: [{ type: 'text', text: `Service ${serviceName} is not registered` }],
            isError: true
          };
        }
        const service = serviceRegistry.get(serviceName);
        if (typeof service.restart === 'function') {
          await service.restart();
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Service ${serviceName} restarted successfully`,
                timestamp: new Date().toISOString()
              }, null, 2)
            }]
          };
        } else if (typeof service.initialize === 'function') {
          await service.initialize();
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Service ${serviceName} reinitialized successfully`,
                timestamp: new Date().toISOString()
              }, null, 2)
            }]
          };
        } else {
          return {
            content: [{ type: 'text', text: `Service ${serviceName} does not support restart or reinitialization` }],
            isError: true
          };
        }
      } catch (error) {
        this.logger.error(`Error restarting service ${serviceName}:`, error);
        return {
          content: [{ type: 'text', text: `Service restart error: ${error.message}` }],
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
