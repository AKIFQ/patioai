#!/usr/bin/env node

/**
 * Memory Analysis CLI Tool
 * 
 * Usage:
 *   node scripts/analyze-memory.js
 *   node scripts/analyze-memory.js --detailed
 *   node scripts/analyze-memory.js --watch
 */

const http = require('http');

const args = process.argv.slice(2);
const isDetailed = args.includes('--detailed');
const isWatch = args.includes('--watch');
const port = process.env.PORT || 3000;

async function fetchMemoryStats(detailed = false) {
  return new Promise((resolve, reject) => {
    const path = detailed ? '/api/admin/memory?detailed=true' : '/api/admin/memory';
    const options = {
      hostname: 'localhost',
      port: port,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.end();
  });
}

async function performAction(action) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: '/api/admin/memory',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.write(JSON.stringify({ action }));
    req.end();
  });
}

function displayMemoryStats(stats) {
  console.clear();
  console.log('🔍 MEMORY ANALYSIS');
  console.log('='.repeat(50));
  console.log();
  
  // Status
  const statusEmoji = stats.status === 'healthy' ? '✅' : 
                     stats.status === 'warning' ? '⚠️' : '🚨';
  console.log(`${statusEmoji} Status: ${stats.status.toUpperCase()}`);
  console.log(`📊 Heap Used: ${stats.current.heapUsed}MB / ${stats.current.heapTotal}MB`);
  console.log(`💾 RSS: ${stats.current.rss}MB`);
  console.log(`🔧 External: ${stats.current.external}MB`);
  console.log(`📦 Array Buffers: ${stats.current.arrayBuffers}MB`);
  console.log(`⏱️  Uptime: ${Math.floor(stats.uptime / 60)}m ${stats.uptime % 60}s`);
  console.log(`🆔 PID: ${stats.pid}`);
  console.log();
  
  console.log(`💡 Recommendation: ${stats.recommendation}`);
  console.log();

  // Detailed analysis
  if (stats.detailed && stats.detailed.objects) {
    console.log('📋 MEMORY OBJECTS BY SIZE:');
    console.log('-'.repeat(80));
    
    stats.detailed.objects.forEach((obj, index) => {
      const size = obj.sizeMB > 1 ? `${obj.sizeMB}MB` : `${obj.sizeKB}KB`;
      const typeEmoji = obj.type === 'network' ? '🌐' :
                       obj.type === 'monitoring' ? '📊' :
                       obj.type === 'events' ? '🎯' :
                       obj.type === 'system' ? '⚙️' : '📦';
      
      console.log(`${index + 1}. ${typeEmoji} ${obj.name}`);
      console.log(`   📏 Size: ${size} | 🔢 Count: ${obj.count.toLocaleString()} | 📍 ${obj.location}`);
      
      if (obj.examples && obj.examples.length > 0) {
        console.log(`   🔍 Sample: ${JSON.stringify(obj.examples[0]).substring(0, 100)}...`);
      }
      console.log();
    });
  }
  
  console.log(`🕐 Last updated: ${new Date().toLocaleTimeString()}`);
  
  if (isWatch) {
    console.log('\n⏱️  Watching... (Press Ctrl+C to exit)');
  }
}

async function main() {
  try {
    console.log(`🔍 Analyzing memory usage on localhost:${port}...`);
    
    if (isWatch) {
      console.log('👀 Watch mode enabled - updating every 5 seconds');
      
      const analyze = async () => {
        try {
          const stats = await fetchMemoryStats(isDetailed);
          displayMemoryStats(stats);
        } catch (error) {
          console.error(`❌ Error: ${error.message}`);
        }
      };
      
      // Initial analysis
      await analyze();
      
      // Watch mode
      setInterval(analyze, 5000);
      
    } else {
      // Single analysis
      const stats = await fetchMemoryStats(isDetailed);
      displayMemoryStats(stats);
      
      // Show available actions
      console.log('\n🛠️  AVAILABLE ACTIONS:');
      console.log('   node scripts/analyze-memory.js --detailed  # Detailed analysis');
      console.log('   node scripts/analyze-memory.js --watch     # Watch mode');
      console.log('\n🧹 SAFE CLEANUP (RECOMMENDED):');
      console.log('   curl -X POST http://localhost:3000/api/admin/memory -d \'{"action":"safe-cleanup"}\'');
      console.log('   curl -X POST http://localhost:3000/api/admin/memory -d \'{"action":"emergency-safe-cleanup"}\'');
      console.log('\n🔧 OTHER ACTIONS:');
      console.log('   curl -X POST http://localhost:3000/api/admin/memory -d \'{"action":"gc"}\'');
      console.log('   curl -X POST http://localhost:3000/api/admin/memory -d \'{"action":"analyze"}\'');
      console.log('   curl -X POST http://localhost:3000/api/admin/memory -d \'{"action":"cleanup-status"}\'');
    }
    
  } catch (error) {
    console.error(`❌ Failed to analyze memory: ${error.message}`);
    console.log('\n💡 Make sure your server is running on localhost:' + port);
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Memory analysis stopped');
  process.exit(0);
});

main();