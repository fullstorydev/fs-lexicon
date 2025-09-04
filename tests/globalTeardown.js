/**
 * Global teardown for Jest tests
 * 
 * This file runs once after all tests complete
 */

export default async () => {
  // Clean up any resources that were created during testing
  console.log('\nCleaning up test environment...');
  
  // Clean up any hanging timers or intervals
  if (typeof global.clearInterval !== 'undefined') {
    // Clear any intervals that might be running
    const maxIntervalId = setTimeout(() => {}, 0);
    for (let i = 1; i < maxIntervalId; i++) {
      clearInterval(i);
      clearTimeout(i);
    }
    clearTimeout(maxIntervalId);
  }
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Clean up any hanging processes
  if (process._getActiveHandles) {
    const handles = process._getActiveHandles();
    handles.forEach(handle => {
      if (handle && typeof handle.close === 'function') {
        try {
          handle.close();
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });
  }
  
  // Wait a moment to ensure any async cleanup completes
  await new Promise(resolve => setTimeout(resolve, 200));
  
  console.log('Test environment cleanup complete!\n');
};