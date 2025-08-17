#!/usr/bin/env node

/**
 * Script to clean up unnecessary console.log statements
 * Keeps only essential error logging and removes verbose debug logs
 */

const fs = require('fs');
const path = require('path');

// Files to clean up
const filesToClean = [
  'app/chat/components/Chat.tsx',
  'lib/server/socketHandlers.ts',
  'lib/server/socketEmitter.ts',
  'lib/client/connectionHealthMonitor.ts',
  'lib/client/socketManager.ts',
  'lib/client/messageQueue.ts',
  'lib/monitoring/errorTracker.ts'
];

// Patterns to remove (keep essential error logging)
const patternsToRemove = [
  // Debug and info console logs
  /console\.log\([^)]*\);?\s*$/gm,
  /console\.info\([^)]*\);?\s*$/gm,
  /console\.debug\([^)]*\);?\s*$/gm,
  
  // Development-only console logs
  /if \(process\.env\.NODE_ENV === 'development'\) console\.[^;]*;/gm,
  
  // Verbose logging patterns
  /console\.log\(`[^`]*`[^)]*\);?\s*$/gm,
  
  // Multi-line console.log statements
  /console\.log\(\s*[^)]*\n[^)]*\);?\s*$/gm,
];

// Patterns to keep (essential error logging)
const keepPatterns = [
  /console\.error/,
  /console\.warn.*error/i,
  /console\.warn.*failed/i,
  /console\.warn.*critical/i,
];

function shouldKeepLine(line) {
  return keepPatterns.some(pattern => pattern.test(line));
}

function cleanFile(filePath) {
  if (!fs.existsSync(filePath)) {
console.log(` File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalLength = content.length;
  
  // Split into lines for more precise control
  const lines = content.split('\n');
  const cleanedLines = lines.map(line => {
    // Keep essential error logging
    if (shouldKeepLine(line)) {
      return line;
    }
    
    // Remove debug console logs
    if (line.includes('console.log') || line.includes('console.info') || line.includes('console.debug')) {
      // Replace with comment if it's a standalone line
      const indent = line.match(/^\s*/)[0];
      return `${indent}// Debug logging removed`;
    }
    
    return line;
  });
  
  content = cleanedLines.join('\n');
  
  // Remove empty comment lines that are consecutive
  content = content.replace(/(\s*\/\/ Debug logging removed\s*\n){2,}/g, '\n');
  
  if (content.length !== originalLength) {
    fs.writeFileSync(filePath, content);
console.log(` Cleaned ${filePath} (${originalLength - content.length} chars removed)`);
  } else {
console.log(` ${filePath} already clean`);
  }
}

function main() {
  console.log('🧹 Starting console.log cleanup...\n');
  
  filesToClean.forEach(cleanFile);
  
console.log('\n Console.log cleanup complete!');
console.log('\n Summary:');
  console.log('   - Removed debug console.log statements');
  console.log('   - Kept essential error logging');
  console.log('   - Replaced verbose logs with comments');
}

if (require.main === module) {
  main();
}

module.exports = { cleanFile };