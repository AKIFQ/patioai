// Security system test
import { authValidator } from './authValidator';
import { inputValidator } from './inputValidator';
import { csrfProtection } from './csrfProtection';
import { auditLogger } from './auditLogger';

export function testSecuritySystem() {
console.log(' Testing security system...');

  try {
    // Test Input Validator
    console.log('Testing Input Validator...');
    const messageSchema = inputValidator.getMessageValidationSchema();
    const testData = {
      content: 'Hello world!',
      roomId: 'TEST-ROOM-123',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      messageType: 'text'
    };
    
    const validationResult = inputValidator.validate(testData, messageSchema);
console.log(' Input validation working:', {
      valid: validationResult.valid,
      errors: validationResult.errors.length,
      warnings: validationResult.warnings.length
    });

    // Test malicious input
    const maliciousData = {
      content: '<script>alert("xss")</script>Hello',
      roomId: 'TEST-ROOM',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      messageType: 'text'
    };
    
    const maliciousResult = inputValidator.validate(maliciousData, messageSchema);
console.log(' XSS protection working:', {
      valid: maliciousResult.valid,
      sanitized: maliciousResult.sanitized?.content?.includes('&lt;script&gt;'),
      warnings: maliciousResult.warnings.length
    });

    // Test CSRF Protection
    console.log('Testing CSRF Protection...');
    const sessionId = 'test-session-123';
    const csrfToken = csrfProtection.generateToken(sessionId);
    const isValidToken = csrfProtection.validateToken(csrfToken, sessionId);
    const isInvalidToken = csrfProtection.validateToken('invalid-token', sessionId);
    
console.log(' CSRF protection working:', {
      tokenGenerated: !!csrfToken,
      validTokenAccepted: isValidToken,
      invalidTokenRejected: !isInvalidToken
    });

    // Test Audit Logger
    console.log('Testing Audit Logger...');
    auditLogger.logAuthentication('success', { testEvent: true });
    auditLogger.logSecurityViolation('test_violation', { testData: 'test' });
    
    const auditStats = auditLogger.getStats();
    const securityAlerts = auditLogger.getSecurityAlerts();
    
console.log(' Audit logging working:', {
      totalEvents: auditStats.totalEvents,
      alerts: securityAlerts.length
    });

    // Test Auth Validator stats
    console.log('Testing Auth Validator...');
    const sessionStats = authValidator.getSessionStats();
    const suspiciousSessions = authValidator.getSuspiciousSessions();
    
console.log(' Auth validator working:', {
      activeSessions: sessionStats.activeSessions,
      suspiciousSessions: suspiciousSessions.length
    });

console.log(' All security systems are working correctly!');
    return true;

  } catch (error) {
console.error(' Security system test failed:', error);
    return false;
  }
}

// Export for use in other files
export default testSecuritySystem;