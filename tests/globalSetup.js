/**
 * Global setup for Jest tests
 * 
 * This file runs once before all tests start
 */

module.exports = async () => {
  // Set up process-wide test environment variables
  process.env.TESTING = 'true';
  
  // Any initial setup that should happen once before all tests
  console.log('\nSetting up test environment...');
  
  // You can add initialization of test databases, mock servers, etc.
  
  // Wait a moment to ensure any async setup completes
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log('Test environment ready!\n');
};