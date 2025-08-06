#!/usr/bin/env node

// Force garbage collection script
console.log('🧹 Forcing garbage collection...');

const before = process.memoryUsage();
console.log(`Memory before GC: ${Math.round(before.heapUsed / 1024 / 1024)}MB`);

// Force garbage collection if available
if (global.gc) {
  global.gc();
  console.log('✅ Garbage collection triggered');
} else {
  console.log('❌ Garbage collection not available (run with --expose-gc)');
}

const after = process.memoryUsage();
console.log(`Memory after GC: ${Math.round(after.heapUsed / 1024 / 1024)}MB`);
console.log(`Memory freed: ${Math.round((before.heapUsed - after.heapUsed) / 1024 / 1024)}MB`);

// Also clear any global caches
if (typeof global !== 'undefined') {
  // Clear require cache for non-core modules
  Object.keys(require.cache).forEach(key => {
    if (!key.includes('node_modules') && key.includes('lib/')) {
      delete require.cache[key];
    }
  });
  console.log('🗑️ Cleared require cache');
}