#!/usr/bin/env node

/**
 * Memory Monitor Script
 * 
 * This script can be run independently to monitor and manage memory usage
 * Usage: node scripts/memory-monitor.js [--cleanup] [--report] [--thresholds warning,critical]
 */

const http = require('http');

const API_BASE = process.env.API_BASE || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';

async function makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result);
                } catch (error) {
                    reject(new Error(`Failed to parse response: ${data}`));
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

async function getMemoryReport() {
    try {
        const response = await makeRequest('/api/monitoring/memory');
        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('❌ Failed to get memory report:', error.message);
        return null;
    }
}

async function triggerCleanup() {
    try {
        console.log('🧹 Triggering memory cleanup...');
        const response = await makeRequest('/api/monitoring/memory', 'POST', { action: 'cleanup' });
        
        if (response.success) {
            console.log('✅', response.message);
            return response.data;
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('❌ Failed to trigger cleanup:', error.message);
        return null;
    }
}

async function updateThresholds(warning, critical) {
    try {
        console.log(`🔧 Updating memory thresholds: Warning=${warning}MB, Critical=${critical}MB`);
        const response = await makeRequest('/api/monitoring/memory', 'POST', {
            action: 'updateThresholds',
            thresholds: { warning, critical }
        });
        
        if (response.success) {
            console.log('✅', response.message);
            return true;
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('❌ Failed to update thresholds:', error.message);
        return false;
    }
}

function formatMemoryReport(report) {
    const { current, thresholds, status, cleanupHistory } = report;
    
    console.log('\n📊 Memory Report');
    console.log('================');
    console.log(`Status: ${getStatusIcon(status)} ${status.toUpperCase()}`);
    console.log(`Heap Used: ${current.heapUsed}MB / ${current.heapTotal}MB`);
    console.log(`RSS: ${current.rss}MB`);
    console.log(`External: ${current.external}MB`);
    console.log(`Array Buffers: ${current.arrayBuffers}MB`);
    console.log(`\nThresholds:`);
    console.log(`  Warning: ${thresholds.warning}MB`);
    console.log(`  Critical: ${thresholds.critical}MB`);
    
    if (cleanupHistory.length > 0) {
        console.log(`\n🧹 Recent Cleanups:`);
        cleanupHistory.forEach((cleanup, index) => {
            const date = new Date(cleanup.timestamp).toLocaleString();
            const freedMB = Math.round(cleanup.freedMemory / 1024 / 1024);
            console.log(`  ${index + 1}. ${date} - Freed ${freedMB}MB (${cleanup.actions.length} actions)`);
        });
    }
    
    console.log('');
}

function getStatusIcon(status) {
    switch (status) {
        case 'healthy': return '✅';
        case 'warning': return '⚠️';
        case 'critical': return '🚨';
        default: return '❓';
    }
}

async function monitorContinuously() {
    console.log('🔄 Starting continuous memory monitoring...');
    console.log('Press Ctrl+C to stop\n');
    
    const interval = setInterval(async () => {
        const report = await getMemoryReport();
        if (report) {
            const { current, status } = report;
            const timestamp = new Date().toLocaleString();
            
            console.log(`[${timestamp}] Memory: ${current.heapUsed}MB ${getStatusIcon(status)} ${status}`);
            
            // Auto-cleanup if critical
            if (status === 'critical' && !report.cleanupInProgress) {
                console.log('🚨 Critical memory usage detected - triggering auto-cleanup');
                await triggerCleanup();
            }
        }
    }, 30000); // Check every 30 seconds
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Stopping memory monitor...');
        clearInterval(interval);
        process.exit(0);
    });
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Memory Monitor Script

Usage: node scripts/memory-monitor.js [options]

Options:
  --report              Show current memory report
  --cleanup             Trigger immediate cleanup
  --monitor             Start continuous monitoring
  --thresholds W,C      Update thresholds (warning,critical in MB)
  --help, -h            Show this help message

Examples:
  node scripts/memory-monitor.js --report
  node scripts/memory-monitor.js --cleanup
  node scripts/memory-monitor.js --monitor
  node scripts/memory-monitor.js --thresholds 2000,3000
        `);
        return;
    }
    
    if (args.includes('--cleanup')) {
        await triggerCleanup();
        return;
    }
    
    if (args.includes('--monitor')) {
        await monitorContinuously();
        return;
    }
    
    const thresholdsIndex = args.indexOf('--thresholds');
    if (thresholdsIndex !== -1 && args[thresholdsIndex + 1]) {
        const [warning, critical] = args[thresholdsIndex + 1].split(',').map(Number);
        if (warning && critical) {
            await updateThresholds(warning, critical);
        } else {
            console.error('❌ Invalid thresholds format. Use: --thresholds warning,critical');
        }
        return;
    }
    
    // Default: show report
    const report = await getMemoryReport();
    if (report) {
        formatMemoryReport(report);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Script error:', error.message);
        process.exit(1);
    });
}

module.exports = {
    getMemoryReport,
    triggerCleanup,
    updateThresholds,
    formatMemoryReport
};