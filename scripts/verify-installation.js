/**
 * Lexicon Installation Verification Script
 * 
 * This script checks that the required dependencies and environment
 * variables are properly set up for Lexicon to run.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Config import must be at the top to load .env file
try {
  require('dotenv').config();
  const config = require('../config');
  console.log('✅ Configuration module loaded successfully');
} catch (error) {
  console.error('❌ Error loading configuration:', error.message);
  process.exit(1);
}

// Terminal formatting
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

// Print header
console.log(`\n${colors.bright}${colors.cyan}========================================${colors.reset}`);
console.log(`${colors.bright}${colors.cyan}   Lexicon Installation Verification${colors.reset}`);
console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}\n`);

// Track verification status
let verificationPassed = true;

/**
 * Execute command and return output, return null if command fails
 */
function execCommand(command) {
  try {
    return execSync(command, { stdio: 'pipe' }).toString().trim();
  } catch (error) {
    return null;
  }
}

/**
 * Check if a command exists
 */
function checkCommand(command) {
  const isWindows = process.platform === 'win32';
  const checkCmd = isWindows ? 
    `where ${command} 2> nul` : 
    `which ${command} 2>/dev/null`;
  
  return execCommand(checkCmd) !== null;
}

/**
 * Print verification result
 */
function printResult(name, status, message = '') {
  if (status) {
    console.log(`${colors.green}✅ ${name}${colors.reset} ${message}`);
  } else {
    console.log(`${colors.red}❌ ${name}${colors.reset} ${message}`);
    verificationPassed = false;
  }
}

/**
 * Check Node.js version
 */
function checkNodeVersion() {
  const nodeVersion = process.version;
  const versionMatch = nodeVersion.match(/^v(\d+)\./);
  const majorVersion = versionMatch ? parseInt(versionMatch[1], 10) : 0;
  
  printResult(
    'Node.js version',
    majorVersion >= 16,
    `${nodeVersion} ${majorVersion >= 16 ? '(OK)' : '(Expected v16 or higher)'}`
  );
}

/**
 * Check npm version
 */
function checkNpmVersion() {
  const npmVersion = execCommand('npm --version');
  const versionMatch = npmVersion ? npmVersion.match(/^(\d+)\./) : null;
  const majorVersion = versionMatch ? parseInt(versionMatch[1], 10) : 0;
  
  printResult(
    'npm version',
    majorVersion >= 8,
    `${npmVersion} ${majorVersion >= 8 ? '(OK)' : '(Expected v8 or higher)'}`
  );
}

/**
 * Check required NPM packages
 */
function checkRequiredPackages() {
  console.log(`\n${colors.cyan}Checking required packages:${colors.reset}`);
  
  try {
    const packageJson = require('../package.json');
    const dependencies = { 
      ...packageJson.dependencies, 
      ...packageJson.devDependencies 
    };
    
    // Check core dependencies
    const coreDeps = ['express', 'dotenv', '@google-cloud/functions-framework', '@azure/functions'];
    for (const dep of coreDeps) {
      try {
        require(dep);
        printResult(dep, true);
      } catch (error) {
        printResult(dep, false, '- Package not found, try running "npm install"');
      }
    }

    // Check database dependencies
    const dbDeps = ['@google-cloud/bigquery', 'snowflake-sdk'];
    console.log(`\n${colors.cyan}Checking database dependencies:${colors.reset}`);
    for (const dep of dbDeps) {
      try {
        require(dep);
        printResult(dep, true);
      } catch (error) {
        printResult(dep, false, '- Package not found, try running "npm install"');
      }
    }

    // Check utility dependencies
    const utilDeps = ['node-fetch', 'date-fns', 'googleapis'];
    console.log(`\n${colors.cyan}Checking utility dependencies:${colors.reset}`);
    for (const dep of utilDeps) {
      try {
        require(dep);
        printResult(dep, true);
      } catch (error) {
        printResult(dep, false, '- Package not found, try running "npm install"');
      }
    }
  } catch (error) {
    console.error('Error reading package.json:', error.message);
  }
}

/**
 * Check for NPM scripts
 */
function checkNpmScripts() {
  console.log(`\n${colors.cyan}Checking NPM scripts:${colors.reset}`);
  
  try {
    const packageJson = require('../package.json');
    const scripts = packageJson.scripts || {};
    
    const criticalScripts = [
      'start', 
      'test', 
      'docker:build', 
      'docker:run',
      'dev:gcf'
    ];
    
    criticalScripts.forEach(scriptName => {
      const hasScript = !!scripts[scriptName];
      printResult(`npm run ${scriptName}`, hasScript, hasScript ? '' : '- Script not found in package.json');
    });
  } catch (error) {
    console.error('Error reading package.json:', error.message);
  }
}

/**
 * Check environment variables
 */
function checkEnvironmentVariables() {
  console.log(`\n${colors.cyan}Checking environment variables:${colors.reset}`);
  
  const envFile = path.join(__dirname, '../.env');
  const hasEnvFile = fs.existsSync(envFile);
  
  printResult('.env file', hasEnvFile);
  
  // Check core environment variables
  const cloudProvider = process.env.cloud_provider || 'GCP';
  printResult('cloud_provider', true, `set to ${cloudProvider}`);
  
  // Check required env vars based on active services
  const requiredVars = {
    fullstory: ['fullstory_token', 'fullstory_org_id', 'fullstory_dc'],
    slack: ['slack_webhook_url'],
    jira: ['jira_base_url', 'jira_api_token', 'jira_username'],
    snowflake: ['snowflake_account_identifier', 'snowflake_user', 'snowflake_warehouse', 'snowflake_database', 'snowflake_schema'],
    google: ['google_project_id', 'google_workspace_keyfile', 'bigquery_keyfile']
  };
  
  // Only check variables for services that are likely being used
  Object.keys(requiredVars).forEach(service => {
    const serviceKey = service === 'fullstory' ? 'fullstory_token' : 
                       service === 'slack' ? 'slack_webhook_url' :
                       service === 'jira' ? 'jira_base_url' :
                       service === 'snowflake' ? 'snowflake_account_identifier' :
                       service === 'google' ? 'google_project_id' : null;
    
    if (serviceKey && process.env[serviceKey]) {
      console.log(`\n${colors.cyan}Checking ${service} configuration:${colors.reset}`);
      
      requiredVars[service].forEach(varName => {
        const hasVar = !!process.env[varName];
        printResult(varName, hasVar, hasVar ? '' : '- Missing recommended variable');
      });
    }
  });
}

/**
 * Check cloud provider CLI tools
 */
function checkCloudCLI() {
  console.log(`\n${colors.cyan}Checking cloud provider CLI tools:${colors.reset}`);
  
  const cloudProvider = process.env.cloud_provider || 'GCP';
  
  // Check Google Cloud CLI
  if (cloudProvider === 'GCP') {
    const hasGcloud = checkCommand('gcloud');
    printResult('gcloud CLI', hasGcloud, hasGcloud ? '' : '- Not found in PATH');
    
    if (hasGcloud) {
      const gcloudInfo = execCommand('gcloud info --format="value(config.account)"');
      if (gcloudInfo) {
        printResult('gcloud authentication', true, `as ${gcloudInfo}`);
      } else {
        printResult('gcloud authentication', false, '- Not authenticated, run "gcloud auth login"');
      }
    }
    
    // Check Functions Framework
    try {
      const ffPath = require.resolve('@google-cloud/functions-framework');
      printResult('Functions Framework', true, 'installed and available');
      
      // Check if npx is available to run it
      const hasNpx = checkCommand('npx');
      printResult('npx for functions-framework', hasNpx, hasNpx ? '' : '- npx not found in PATH');
    } catch (error) {
      printResult('Functions Framework', false, '- Not installed, run "npm install @google-cloud/functions-framework"');
    }
  }
  
  // Check Azure CLI
  if (cloudProvider === 'AZURE') {
    const hasAz = checkCommand('az');
    printResult('Azure CLI', hasAz, hasAz ? '' : '- Not found in PATH');
    
    if (hasAz) {
      const azAccount = execCommand('az account show --query user.name -o tsv');
      if (azAccount) {
        printResult('Azure authentication', true, `as ${azAccount}`);
      } else {
        printResult('Azure authentication', false, '- Not authenticated, run "az login"');
      }
    }
    
    const hasFunc = checkCommand('func');
    printResult('Azure Functions Core Tools', hasFunc, hasFunc ? '' : '- Not found in PATH');
  }
  
  // Check AWS CLI
  if (cloudProvider === 'AWS') {
    const hasAws = checkCommand('aws');
    printResult('AWS CLI', hasAws, hasAws ? '' : '- Not found in PATH');
    
    if (hasAws) {
      const awsUser = execCommand('aws sts get-caller-identity --query "Arn" --output text');
      if (awsUser) {
        printResult('AWS authentication', true, `as ${awsUser.split('/').pop()}`);
      } else {
        printResult('AWS authentication', false, '- Not authenticated, run "aws configure"');
      }
    }
  }
}

/**
 * Check Docker installation
 */
function checkDocker() {
  console.log(`\n${colors.cyan}Checking Docker installation:${colors.reset}`);
  
  const hasDocker = checkCommand('docker');
  printResult('Docker', hasDocker, hasDocker ? '' : '- Not found in PATH');
  
  if (hasDocker) {
    const dockerVersion = execCommand('docker --version');
    if (dockerVersion) {
      printResult('Docker version', true, dockerVersion);
      
      // Check if Docker is running
      const dockerRunning = execCommand('docker info') !== null;
      printResult('Docker daemon', dockerRunning, dockerRunning ? 'running' : '- Docker daemon is not running');
      
      if (dockerRunning) {
        // Check if our Dockerfile exists
        const hasDockerfile = fs.existsSync(path.join(__dirname, '../Dockerfile'));
        printResult('Dockerfile', hasDockerfile, hasDockerfile ? '' : '- Dockerfile not found');
      }
    }
  }
  
}

/**
 * Check core files
 */
function checkCoreFiles() {
  console.log(`\n${colors.cyan}Checking core files:${colors.reset}`);
  
  const coreFiles = [
    'index.js',
    'config.js',
    'middleware.js',
    'webhookRouter.js',
    'connectorBase.js',
    'Fullstory.js',
    'Snowflake.js',
    'Atlassian.js',
    'GoogleCloud.js',
    'konbini.js',
    'loggerFramework.js',
    'initialization.js'
  ];
  
  coreFiles.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    const fileExists = fs.existsSync(filePath);
    printResult(file, fileExists, fileExists ? '' : '- File not found');
  });
}

// Run verification checks
function runVerification() {
  try {
    console.log(`${colors.cyan}Checking system requirements:${colors.reset}`);
    checkNodeVersion();
    checkNpmVersion();
    checkRequiredPackages();
    checkNpmScripts();
    checkCoreFiles();
    checkEnvironmentVariables();
    checkCloudCLI();
    checkDocker();
    
    console.log(`\n${colors.cyan}Verification ${verificationPassed ? 'passed' : 'finished with warnings'}${colors.reset}`);
    
    if (!verificationPassed) {
      console.log(`\n${colors.yellow}⚠️  Please fix the warnings above to ensure Lexicon works correctly.${colors.reset}`);
    } else {
      console.log(`\n${colors.green}🎉 Lexicon is ready to run! Start the application with:${colors.reset}`);
      console.log(`\n   ${colors.bright}npm start${colors.reset} - Run locally`);
      console.log(`   ${colors.bright}npm run dev:gcf${colors.reset} - Run locally using Functions Framework`);
      console.log(`   ${colors.bright}npm run docker:run${colors.reset} - Run in Docker`);
      
      // Show different cloud provider specifics
      const cloudProvider = process.env.cloud_provider || 'GCP';
      if (cloudProvider === 'GCP') {
        console.log(`   ${colors.bright}npm run docker:run:gcp${colors.reset} - Run Docker with GCP environment`);
      } else if (cloudProvider === 'AZURE') {
        console.log(`   ${colors.bright}npm run docker:run:azure${colors.reset} - Run Docker with Azure environment`);
      } else if (cloudProvider === 'AWS') {
        console.log(`   ${colors.bright}npm run docker:run:aws${colors.reset} - Run Docker with AWS environment`);
      }
    }
    
    console.log(`\n${colors.cyan}========================================${colors.reset}\n`);
  } catch (error) {
    console.error('\nVerification error:', error);
    process.exit(1);
  }
}

// Start verification
runVerification();
