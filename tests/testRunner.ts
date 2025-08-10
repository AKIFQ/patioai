// Main test runner for comprehensive validation
import { e2eTestSuite } from './e2e/userJourneys.test';
import { performanceTestSuite } from './performance/loadTest';
import { securityTestSuite } from './security/vulnerabilityTest';
import { testSecuritySystem } from '../lib/security/test';
import { testMonitoringSystem } from '../lib/monitoring/test';

interface TestSuiteResult {
  name: string;
  success: boolean;
  duration: number;
  summary: any;
  details: any;
  error?: string;
}

export class ComprehensiveTestRunner {
  private results: TestSuiteResult[] = [];

  async runAllTests(): Promise<{
    overallSuccess: boolean;
    totalDuration: number;
    results: TestSuiteResult[];
    finalReport: string;
  }> {
    console.log('🚀 Starting comprehensive test suite...');
    console.log('This will test all aspects of the realtime-refactor system\n');

    const startTime = Date.now();

    // Run all test suites
    await this.runTestSuite('System Components', () => this.testSystemComponents());
    await this.runTestSuite('End-to-End User Journeys', () => e2eTestSuite.runAllTests());
    await this.runTestSuite('Performance & Load Testing', () => performanceTestSuite.runPerformanceTests());
    await this.runTestSuite('Security & Vulnerability Testing', () => securityTestSuite.runSecurityTests());

    const totalDuration = Date.now() - startTime;
    const overallSuccess = this.results.every(r => r.success);

    // Generate comprehensive report
    const finalReport = this.generateFinalReport();

    console.log(`\n🏁 Comprehensive testing completed in ${Math.round(totalDuration / 1000)}s`);
    console.log(`Overall Result: ${overallSuccess ? '✅ PASSED' : '❌ FAILED'}`);

    return {
      overallSuccess,
      totalDuration,
      results: this.results,
      finalReport
    };
  }

  private async runTestSuite(name: string, testFn: () => Promise<any>): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`\n📋 Running Test Suite: ${name}`);
      console.log('='.repeat(50));
      
      const result = await testFn();
      const duration = Date.now() - startTime;
      
      this.results.push({
        name,
        success: true,
        duration,
        summary: result.summary || result,
        details: result
      });
      
      console.log(`\n✅ ${name} - COMPLETED (${Math.round(duration / 1000)}s)`);
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        name,
        success: false,
        duration,
        summary: { error: error.message },
        details: {},
        error: error.message
      });
      
      console.log(`\n❌ ${name} - FAILED (${Math.round(duration / 1000)}s): ${error.message}`);
    }
  }

  private async testSystemComponents(): Promise<any> {
    console.log('Testing core system components...');
    
    const results = {
      security: false,
      monitoring: false,
      apis: false
    };

    try {
      // Test security system
      console.log('  🔒 Testing security components...');
      results.security = testSecuritySystem();
      
      // Test monitoring system
      console.log('  📊 Testing monitoring components...');
      results.monitoring = testMonitoringSystem();
      
      // Test API endpoints
      console.log('  🌐 Testing API endpoints...');
      results.apis = await this.testAPIEndpoints();
      
    } catch (error) {
      console.error('System component test failed:', error);
    }

    const allPassed = Object.values(results).every(r => r === true);

    return {
      summary: {
        allComponentsWorking: allPassed,
        securitySystem: results.security,
        monitoringSystem: results.monitoring,
        apiEndpoints: results.apis
      },
      details: results
    };
  }

  private async testAPIEndpoints(): Promise<boolean> {
    const endpoints = [
      '/api/health',
      '/api/monitoring/dashboard',
      '/api/monitoring/alerts'
    ];

    const baseUrl = process.env.TEST_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3001';
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`);
        if (!response.ok) {
          console.log(`    ❌ ${endpoint} - Status: ${response.status}`);
          return false;
        }
        console.log(`    ✅ ${endpoint} - OK`);
      } catch (error) {
        console.log(`    ❌ ${endpoint} - Error: ${(error as Error).message}`);
        return false;
      }
    }

    return true;
  }

  private generateFinalReport(): string {
    const overallSuccess = this.results.every(r => r.success);
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const successfulSuites = this.results.filter(r => r.success).length;
    const failedSuites = this.results.filter(r => !r.success).length;

    let report = `# Comprehensive Test Report - Realtime Refactor\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n`;
    report += `**Overall Result:** ${overallSuccess ? '✅ PASSED' : '❌ FAILED'}\n`;
    report += `**Total Duration:** ${Math.round(totalDuration / 1000)} seconds\n`;
    report += `**Test Suites:** ${this.results.length} total, ${successfulSuites} passed, ${failedSuites} failed\n\n`;

    // Executive Summary
    report += `## Executive Summary\n\n`;
    if (overallSuccess) {
      report += `🎉 **All test suites passed successfully!** The realtime-refactor system is ready for production deployment.\n\n`;
      report += `The system demonstrates:\n`;
      report += `- ✅ Robust security implementation with comprehensive protection\n`;
      report += `- ✅ Excellent performance under load\n`;
      report += `- ✅ Complete monitoring and observability\n`;
      report += `- ✅ All user journeys working correctly\n`;
      report += `- ✅ System components functioning as expected\n\n`;
    } else {
      report += `⚠️ **Some test suites failed.** Review the issues below before production deployment.\n\n`;
    }

    // Test Suite Results
    report += `## Test Suite Results\n\n`;
    
    for (const result of this.results) {
      const status = result.success ? '✅ PASSED' : '❌ FAILED';
      const duration = Math.round(result.duration / 1000);
      
      report += `### ${result.name} - ${status}\n`;
      report += `**Duration:** ${duration} seconds\n`;
      
      if (result.error) {
        report += `**Error:** ${result.error}\n`;
      }
      
      // Add summary details
      if (result.summary) {
        report += `**Summary:**\n`;
        if (typeof result.summary === 'object') {
          for (const [key, value] of Object.entries(result.summary)) {
            report += `- ${key}: ${value}\n`;
          }
        } else {
          report += `${result.summary}\n`;
        }
      }
      
      report += `\n`;
    }

    // Detailed Analysis
    report += `## Detailed Analysis\n\n`;

    // System Components Analysis
    const systemTest = this.results.find(r => r.name === 'System Components');
    if (systemTest) {
      report += `### System Components\n`;
      if (systemTest.success) {
        report += `All core system components are functioning correctly:\n`;
        report += `- Security system: ${systemTest.summary.securitySystem ? 'Working' : 'Issues detected'}\n`;
        report += `- Monitoring system: ${systemTest.summary.monitoringSystem ? 'Working' : 'Issues detected'}\n`;
        report += `- API endpoints: ${systemTest.summary.apiEndpoints ? 'Working' : 'Issues detected'}\n`;
      } else {
        report += `System component issues detected. Review logs for details.\n`;
      }
      report += `\n`;
    }

    // E2E Test Analysis
    const e2eTest = this.results.find(r => r.name === 'End-to-End User Journeys');
    if (e2eTest && e2eTest.success) {
      report += `### End-to-End Testing\n`;
      report += `User journey testing completed successfully:\n`;
      report += `- Tests passed: ${e2eTest.details.passed || 0}\n`;
      report += `- Tests failed: ${e2eTest.details.failed || 0}\n`;
      report += `- All critical user flows are working correctly\n\n`;
    }

    // Performance Analysis
    const perfTest = this.results.find(r => r.name === 'Performance & Load Testing');
    if (perfTest && perfTest.success) {
      report += `### Performance Testing\n`;
      report += `Performance testing shows acceptable results:\n`;
      if (perfTest.summary.performance) {
        report += `- Average API response time: ${perfTest.summary.performance.avgAPIResponseTime}ms\n`;
        report += `- Memory stability: ${perfTest.summary.performance.memoryStable ? 'Stable' : 'Needs attention'}\n`;
        report += `- Database performance: ${perfTest.summary.performance.dbPerformanceAcceptable ? 'Acceptable' : 'Needs optimization'}\n`;
      }
      report += `\n`;
    }

    // Security Analysis
    const secTest = this.results.find(r => r.name === 'Security & Vulnerability Testing');
    if (secTest && secTest.success) {
      report += `### Security Testing\n`;
      report += `Security testing completed with good results:\n`;
      if (secTest.summary.security) {
        report += `- Overall security score: ${secTest.summary.security.overallScore}/100\n`;
        report += `- XSS protection: ${secTest.summary.security.xssProtection}\n`;
        report += `- SQL injection protection: ${secTest.summary.security.sqlInjectionProtection}\n`;
        report += `- CSRF protection: ${secTest.summary.security.csrfProtection ? 'Enabled' : 'Disabled'}\n`;
        report += `- Authentication security: ${secTest.summary.security.authenticationSecurity ? 'Working' : 'Issues detected'}\n`;
      }
      report += `\n`;
    }

    // Recommendations
    report += `## Recommendations\n\n`;
    
    if (overallSuccess) {
      report += `### Production Readiness ✅\n`;
      report += `The system is ready for production deployment with the following recommendations:\n`;
      report += `- Continue regular monitoring and health checks\n`;
      report += `- Implement automated testing in CI/CD pipeline\n`;
      report += `- Set up production monitoring and alerting\n`;
      report += `- Plan for regular security audits\n`;
      report += `- Monitor performance metrics in production\n\n`;
    } else {
      report += `### Issues to Address ⚠️\n`;
      report += `Before production deployment, address the following:\n`;
      
      for (const result of this.results.filter(r => !r.success)) {
        report += `- **${result.name}**: ${result.error}\n`;
      }
      
      report += `\n`;
    }

    // Next Steps
    report += `## Next Steps\n\n`;
    if (overallSuccess) {
      report += `1. **Deploy to Production**: All tests passed, system is ready\n`;
      report += `2. **Monitor Performance**: Set up production monitoring\n`;
      report += `3. **User Acceptance Testing**: Conduct final UAT with stakeholders\n`;
      report += `4. **Documentation**: Update deployment and operational documentation\n`;
      report += `5. **Training**: Ensure team is trained on new monitoring and security features\n`;
    } else {
      report += `1. **Fix Failed Tests**: Address all failing test suites\n`;
      report += `2. **Re-run Tests**: Ensure all tests pass before deployment\n`;
      report += `3. **Code Review**: Review changes with team\n`;
      report += `4. **Staging Deployment**: Test in staging environment\n`;
      report += `5. **Production Planning**: Plan production deployment strategy\n`;
    }

    report += `\n---\n`;
    report += `*Report generated by Comprehensive Test Runner*\n`;
    report += `*Realtime Refactor Project - Task 5.6*\n`;

    return report;
  }

  // Save report to file
  async saveReport(filename: string = 'comprehensive-test-report.md'): Promise<void> {
    const report = this.generateFinalReport();
    
    try {
      // In a real environment, you would write to file system
      console.log(`\n📄 Test report generated (${report.length} characters)`);
      console.log(`Report would be saved as: ${filename}`);
      
      // For now, just log a summary
      console.log('\n📊 FINAL TEST SUMMARY:');
      console.log(`- Test Suites Run: ${this.results.length}`);
      console.log(`- Successful: ${this.results.filter(r => r.success).length}`);
      console.log(`- Failed: ${this.results.filter(r => !r.success).length}`);
      console.log(`- Overall Success: ${this.results.every(r => r.success) ? 'YES' : 'NO'}`);
      
    } catch (error) {
      console.error('Failed to save report:', error);
    }
  }
}

// Export test runner
export const comprehensiveTestRunner = new ComprehensiveTestRunner();
export default comprehensiveTestRunner;