#!/usr/bin/env node

/**
 * Comprehensive Test Runner for Lexicon
 * Runs all types of tests including rate limiting tests
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

// Test configurations
const testConfigs = {
  unit: {
    name: 'Unit Tests',
    command: 'npm',
    args: ['run', 'test:unit'],
    description: 'Jest unit tests'
  },
  rateLimitingUnit:   {
    name: 'Rate Limiting Unit Tests',
    command: 'npm',
    args: ['run', 'test:rate-limiting'],
    description: 'Rate limiting unit tests with mocks'
  },
  mcpScript: {
    name: 'MCP & Rate Limiting Integration Tests',
    command: './tests/enhanced-mcp-test.sh',
    args: [],
    description: 'Enhanced MCP test script with rate limiting',
    requiresServer: true
  },
  rateLimitingIntegration: {
    name: 'Rate Limiting Integration Tests',
    command: 'npm',
    args: ['run', 'test:rate-limiting:integration'],
    description: 'Rate limiting integration tests against running server',
    requiresServer: true
  },
  mcpAuth: {
    name: 'MCP Authentication Tests',
    command: 'npm',
    args: ['run', 'test:mcp:auth'],
    description: 'OAuth 2.1 authentication system tests'
  },
  mcpValidation: {
    name: 'MCP Input Validation Tests',
    command: 'npm',
    args: ['run', 'test:mcp:validation'],
    description: 'Input validation and sanitization tests'
  },
  mcpSecurityIntegration: {
    name: 'MCP Security Integration Tests',
    command: 'npm',
    args: ['run', 'test:mcp:security'],
    description: 'End-to-end security integration tests',
    requiresServer: true
  }
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(message, color = 'reset') {
  console.log(colorize(message, color));
}

async function runCommand(command, args, cwd = projectRoot) {
  return new Promise((resolve) => {
    log(`Running: ${command} ${args.join(' ')}`, 'cyan');
    
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      resolve(code);
    });
    
    child.on('error', (error) => {
      log(`Error running command: ${error.message}`, 'red');
      resolve(1);
    });
  });
}

async function checkServerHealth(url, maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(url);
      
      // For testing, accept any response that indicates server is running
      // Even 503 (Service Unavailable) means server is responding, just stressed
      if (response.status >= 200 && response.status < 600) {
        const text = await response.text();
        // If we get valid JSON response, server is functional
        if (text && (text.includes('"status"') || text.includes('"timestamp"'))) {
          return true;
        }
      }
    } catch (error) {
      // Server not ready
    }
    
    if (i < maxAttempts - 1) {
      log(`Server not ready, waiting... (attempt ${i + 1}/${maxAttempts})`, 'yellow');
      await setTimeout(2000);
    }
  }
  return false;
}

async function startTestServer() {
  log('\n🚀 Starting test server...', 'blue');
  
  // Start server in background with MCP mode enabled
  const serverProcess = spawn('npm', ['start'], {
    cwd: projectRoot,
    stdio: 'pipe', // Capture output
    detached: true,
    env: { ...process.env, MCP_MODE: 'true', NODE_ENV: 'test' }
  });
  
  // Give server time to start
  await setTimeout(3000);
  
  // Check if server is healthy
  const serverReady = await checkServerHealth('http://localhost:8080/health');
  
  if (serverReady) {
    log('✅ Test server is running and healthy', 'green');
    return serverProcess;
  } else {
    log('❌ Test server failed to start or is unhealthy', 'red');
    serverProcess.kill();
    return null;
  }
}

async function runTestSuite(testKey, config) {
  log(`\n${'='.repeat(50)}`, 'blue');
  log(`🧪 ${config.name}`, 'bright');
  log(`📝 ${config.description}`, 'blue');
  log(`${'='.repeat(50)}`, 'blue');
  
  const startTime = Date.now();
  const exitCode = await runCommand(config.command, config.args);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  if (exitCode === 0) {
    log(`✅ ${config.name} completed successfully in ${duration}s`, 'green');
    return true;
  } else {
    log(`❌ ${config.name} failed (exit code: ${exitCode}) after ${duration}s`, 'red');
    return false;
  }
}

async function main() {
  log(colorize('\n🔬 Comprehensive Lexicon Test Suite', 'bright'));
  log(colorize('=====================================', 'blue'));
  
  const startTime = Date.now();
  const results = {
    passed: [],
    failed: [],
    skipped: []
  };
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const skipServer = args.includes('--skip-server');
  const testFilter = args.find(arg => arg.startsWith('--test='))?.split('=')[1];
  
  // Filter tests if specified
  let testsToRun = Object.entries(testConfigs);
  if (testFilter) {
    testsToRun = testsToRun.filter(([key]) => key.includes(testFilter));
    if (testsToRun.length === 0) {
      log(`❌ No tests found matching filter: ${testFilter}`, 'red');
      process.exit(1);
    }
  }
  
  log(`\n📋 Running ${testsToRun.length} test suite(s):`);
  testsToRun.forEach(([key, config]) => {
    log(`   • ${config.name}${config.requiresServer ? ' (requires server)' : ''}`, 'cyan');
  });
  
  // Check if server is needed and handle server startup/detection
  let serverProcess = null;
  const needsServer = testsToRun.some(([, config]) => config.requiresServer);
  
  if (needsServer && !skipServer) {
    // First check if server is already running
    log('\n🔍 Checking if server is already running...', 'blue');
    const serverAlreadyRunning = await checkServerHealth('http://localhost:8080/health', 1);
    
    if (serverAlreadyRunning) {
      log('✅ Found running server at localhost:8080', 'green');
    } else {
      log('🚀 No server detected, starting test server...', 'blue');
      serverProcess = await startTestServer();
      if (!serverProcess) {
        log('\n❌ Cannot run server-dependent tests without a healthy server', 'red');
        log('💡 Use --skip-server to run only unit tests', 'yellow');
        log('💡 Start the server manually with: MCP_MODE=true npm start', 'yellow');
        log('💡 (Add rate limit overrides if needed for heavy testing)', 'cyan');
        process.exit(1);
      }
    }
  }
  
  // Run each test suite
  for (const [testKey, config] of testsToRun) {
    if (config.requiresServer && skipServer) {
      log(`\n⏭️  Skipping ${config.name} (server tests skipped)`, 'yellow');
      results.skipped.push(config.name);
      continue;
    }
    
    const success = await runTestSuite(testKey, config);
    if (success) {
      results.passed.push(config.name);
    } else {
      results.failed.push(config.name);
    }
  }
  
  // Clean up server
  if (serverProcess) {
    log('\n🛑 Stopping test server...', 'blue');
    serverProcess.kill();
    // Kill the entire process group
    try {
      process.kill(-serverProcess.pid);
    } catch (error) {
      // Ignore errors when killing process group
    }
  }
  
  // Results summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  
  log('\n' + '='.repeat(50), 'blue');
  log('📊 TEST RESULTS SUMMARY', 'bright');
  log('='.repeat(50), 'blue');
  
  log(`\n⏱️  Total time: ${totalTime}s`, 'blue');
  log(`📈 Total suites: ${results.passed.length + results.failed.length + results.skipped.length}`, 'blue');
  
  if (results.passed.length > 0) {
    log(`\n✅ Passed (${results.passed.length}):`, 'green');
    results.passed.forEach(name => log(`   • ${name}`, 'green'));
  }
  
  if (results.failed.length > 0) {
    log(`\n❌ Failed (${results.failed.length}):`, 'red');
    results.failed.forEach(name => log(`   • ${name}`, 'red'));
  }
  
  if (results.skipped.length > 0) {
    log(`\n⏭️  Skipped (${results.skipped.length}):`, 'yellow');
    results.skipped.forEach(name => log(`   • ${name}`, 'yellow'));
  }
  
  // Final result
  if (results.failed.length === 0) {
    log('\n🎉 All tests passed!', 'green');
    process.exit(0);
  } else {
    log('\n💥 Some tests failed', 'red');
    process.exit(1);
  }
}

// Handle interruption
process.on('SIGINT', () => {
  log('\n🛑 Test suite interrupted', 'yellow');
  process.exit(130);
});

process.on('uncaughtException', (error) => {
  log(`\n💥 Uncaught exception: ${error.message}`, 'red');
  process.exit(1);
});

// Run the test suite
main().catch(error => {
  log(`\n💥 Test runner failed: ${error.message}`, 'red');
  process.exit(1);
});
