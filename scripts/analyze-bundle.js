#!/usr/bin/env node

/**
 * Bundle Analysis Script
 * Analyzes the Next.js bundle for optimization opportunities
 */

const fs = require('fs');
const path = require('path');

// Colors for console output
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

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function analyzeBundle() {
log(' Analyzing Next.js Bundle...', 'cyan');
  
  const buildDir = path.join(process.cwd(), '.next');
  
  if (!fs.existsSync(buildDir)) {
log(' No build directory found. Run `npm run build` first.', 'red');
    return;
  }

  // Analyze static chunks
  const staticDir = path.join(buildDir, 'static', 'chunks');
  if (fs.existsSync(staticDir)) {
    analyzeChunks(staticDir);
  }

  // Analyze pages
  const pagesDir = path.join(buildDir, 'static', 'chunks', 'pages');
  if (fs.existsSync(pagesDir)) {
    analyzePages(pagesDir);
  }

  // Provide optimization recommendations
  provideRecommendations();
}

function analyzeChunks(chunksDir) {
log('\n Analyzing Chunks:', 'yellow');
  
  const chunks = fs.readdirSync(chunksDir)
    .filter(file => file.endsWith('.js'))
    .map(file => {
      const filePath = path.join(chunksDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        sizeKB: Math.round(stats.size / 1024)
      };
    })
    .sort((a, b) => b.size - a.size);

  chunks.slice(0, 10).forEach((chunk, index) => {
    const color = chunk.sizeKB > 500 ? 'red' : chunk.sizeKB > 200 ? 'yellow' : 'green';
    log(`  ${index + 1}. ${chunk.name} - ${chunk.sizeKB}KB`, color);
  });

  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
log(`\n Total chunks size: ${Math.round(totalSize / 1024)}KB`, 'bright');
}

function analyzePages(pagesDir) {
log('\n Analyzing Pages:', 'yellow');
  
  const pages = fs.readdirSync(pagesDir)
    .filter(file => file.endsWith('.js'))
    .map(file => {
      const filePath = path.join(pagesDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file.replace('.js', ''),
        size: stats.size,
        sizeKB: Math.round(stats.size / 1024)
      };
    })
    .sort((a, b) => b.size - a.size);

  pages.forEach((page, index) => {
    const color = page.sizeKB > 100 ? 'red' : page.sizeKB > 50 ? 'yellow' : 'green';
    log(`  ${index + 1}. /${page.name} - ${page.sizeKB}KB`, color);
  });
}

function provideRecommendations() {
log('\n Optimization Recommendations:', 'magenta');
  
  const recommendations = [
    '1. Use dynamic imports for heavy components',
    '2. Implement code splitting for large pages',
    '3. Optimize images with Next.js Image component',
    '4. Remove unused dependencies',
    '5. Use React.memo for expensive components',
    '6. Implement virtual scrolling for long lists',
    '7. Lazy load non-critical components',
    '8. Use bundle analyzer for detailed analysis: npm install --save-dev @next/bundle-analyzer'
  ];

  recommendations.forEach(rec => log(`  ${rec}`, 'cyan'));
  
log('\n Performance Optimizations Applied:', 'green');
  const applied = [
' React.memo for ChatMessage component',
' Virtual scrolling for message lists',
' Dynamic imports for heavy components',
' Performance monitoring hooks',
' Memoized callbacks and effects'
  ];
  
  applied.forEach(item => log(`  ${item}`, 'green'));
}

// Run the analysis
if (require.main === module) {
  analyzeBundle();
}

module.exports = { analyzeBundle };