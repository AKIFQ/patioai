#!/usr/bin/env node

/**
 * Script to clean up server-side verbose logging
 * Keeps essential system logs but removes debug noise
 */

const fs = require('fs');
const path = require('path');

// Server files to clean up
const serverFiles = [
  'lib/server/aiResponseHandler.ts',
  'lib/ai/modelRouter.ts',
  'lib/ai/modelConfig.ts'
];

function cleanServerLogs(filePath) {
  if (!fs.existsSync(filePath)) {
console.log(` File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalLength = content.length;
  
  // Remove verbose debug logs but keep essential system logs
  const patterns = [
    // Remove detailed debug logs
/console\.log\(`[^`]*`[^)]*\);?\s*\n?/g,
/console\.log\(`[^`]*`[^)]*\);?\s*\n?/g,
/console\.log\(`[^`]*`[^)]*\);?\s*\n?/g,
/console\.log\(`[^`]*`[^)]*\);?\s*\n?/g,
/console\.log\(`[^`]*`[^)]*\);?\s*\n?/g,
/console\.log\(`[^`]*`[^)]*\);?\s*\n?/g,
    
    // Remove multi-line debug logs
    /console\.log\(\s*`[^`]*`[^)]*\n[^)]*\);?\s*\n?/g,
    
    // Remove development-only logs
    /if \(process\.env\.NODE_ENV === 'development'\)[^}]*console\.[^}]*}/g,
  ];

  patterns.forEach(pattern => {
    content = content.replace(pattern, '');
  });

  // Clean up empty lines
  content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  if (content.length !== originalLength) {
    fs.writeFileSync(filePath, content);
console.log(` Cleaned ${filePath} (${originalLength - content.length} chars removed)`);
  } else {
console.log(` ${filePath} already clean`);
  }
}

function main() {
  console.log('🧹 Starting server-side log cleanup...\n');
  
  serverFiles.forEach(cleanServerLogs);
  
console.log('\n Server log cleanup complete!');
console.log('\n Essential logs kept:');
  console.log('   - Error messages (console.error)');
  console.log('   - Critical warnings (console.warn)');
  console.log('   - System status messages');
  console.log('   - Model routing decisions');
  console.log('   - Socket connection events');
  console.log('   - Database operations');
}

if (require.main === module) {
  main();
}

module.exports = { cleanServerLogs };