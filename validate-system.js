// Simple system validation script
const baseUrl = 'http://localhost:3001';

async function validateSystem() {
  console.log('🧪 Running system validation...\n');
  
  const tests = [
    { name: 'Health Check', url: '/api/health' },
    { name: 'Monitoring Dashboard', url: '/api/monitoring/dashboard' },
    { name: 'Monitoring Alerts', url: '/api/monitoring/alerts' },
    { name: 'Monitoring Page', url: '/monitoring' }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const response = await fetch(`${baseUrl}${test.url}`);
      if (response.ok) {
        console.log(`✅ ${test.name} - PASSED (${response.status})`);
        passed++;
      } else {
        console.log(`❌ ${test.name} - FAILED (${response.status})`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} - ERROR: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  console.log(`Overall: ${failed === 0 ? '✅ SYSTEM HEALTHY' : '⚠️ ISSUES DETECTED'}`);
  
  return failed === 0;
}

// Run validation
validateSystem().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Validation failed:', error);
  process.exit(1);
});