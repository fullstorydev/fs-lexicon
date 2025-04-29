/**
 * Global teardown for Jest tests
 * 
 * This file runs once after all tests complete
 */

module.exports = async () => {
  // Clean up any resources that were created during testing
  console.log('\nCleaning up test environment...');
  
  // You can add cleanup of test databases, mock servers, etc.
  
  // Wait a moment to ensure any async cleanup completes
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log('Test environment cleanup complete!\n');
};