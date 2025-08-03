import { ErrorTracker } from '../monitoring/errorTracker';

// Validation result interface
interface ValidationResult {
  valid: boolean;
  sanitized?: any;
  errors: string[];
  warnings: string[];
}

// Validation rules interface
interface ValidationRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'email' | 'url' | 'uuid' | 'json';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  allowedValues?: any[];
  sanitize?: boolean;
  customValidator?: (value: any) => boolean;
}

export class InputValidator {
  private static instance: InputValidator;
  private errorTracker: ErrorTracker;

  // Common regex patterns
  private patterns = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
    alphanumeric: /^[a-zA-Z0-9]+$/,
    alphanumericWithSpaces: /^[a-zA-Z0-9\s]+$/,
    noScriptTags: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    sqlInjection: /(union|select|insert|update|delete|drop|create|alter|exec|execute|script|javascript|vbscript|onload|onerror|onclick)/i,
    xss: /(<script|<iframe|<object|<embed|<link|<meta|javascript:|vbscript:|data:text\/html|on\w+\s*=)/i
  };

  private constructor() {
    this.errorTracker = ErrorTracker.getInstance();
  }

  static getInstance(): InputValidator {
    if (!InputValidator.instance) {
      InputValidator.instance = new InputValidator();
    }
    return InputValidator.instance;
  }

  // Main validation method
  validate(data: any, rules: Record<string, ValidationRule>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitized: any = {};

    try {
      for (const [field, rule] of Object.entries(rules)) {
        const value = data[field];
        const fieldResult = this.validateField(field, value, rule);
        
        if (!fieldResult.valid) {
          errors.push(...fieldResult.errors);
        }
        
        warnings.push(...fieldResult.warnings);
        
        if (fieldResult.sanitized !== undefined) {
          sanitized[field] = fieldResult.sanitized;
        }
      }

      // Check for unexpected fields
      const allowedFields = Object.keys(rules);
      const providedFields = Object.keys(data);
      const unexpectedFields = providedFields.filter(field => !allowedFields.includes(field));
      
      if (unexpectedFields.length > 0) {
        warnings.push(`Unexpected fields: ${unexpectedFields.join(', ')}`);
        this.logSecurityEvent('unexpected_fields', { fields: unexpectedFields });
      }

      return {
        valid: errors.length === 0,
        sanitized,
        errors,
        warnings
      };

    } catch (error: any) {
      this.errorTracker.trackError('error', 'system', 'Input validation failed', { error: error.message });
      return {
        valid: false,
        errors: ['Validation system error'],
        warnings: []
      };
    }
  }

  // Validate individual field
  private validateField(fieldName: string, value: any, rule: ValidationRule): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let sanitized = value;

    // Check if required
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`${fieldName} is required`);
      return { valid: false, errors, warnings };
    }

    // Skip validation if value is empty and not required
    if (!rule.required && (value === undefined || value === null || value === '')) {
      return { valid: true, sanitized: value, errors: [], warnings: [] };
    }

    // Type validation and conversion
    const typeResult = this.validateType(fieldName, value, rule.type);
    if (!typeResult.valid) {
      errors.push(...typeResult.errors);
    } else {
      sanitized = typeResult.sanitized;
    }

    // String-specific validations
    if (rule.type === 'string' || typeof sanitized === 'string') {
      const stringResult = this.validateString(fieldName, sanitized, rule);
      errors.push(...stringResult.errors);
      warnings.push(...stringResult.warnings);
      if (stringResult.sanitized !== undefined) {
        sanitized = stringResult.sanitized;
      }
    }

    // Number-specific validations
    if (rule.type === 'number' || typeof sanitized === 'number') {
      const numberResult = this.validateNumber(fieldName, sanitized, rule);
      errors.push(...numberResult.errors);
    }

    // Pattern validation
    if (rule.pattern && typeof sanitized === 'string') {
      if (!rule.pattern.test(sanitized)) {
        errors.push(`${fieldName} does not match required pattern`);
      }
    }

    // Allowed values validation
    if (rule.allowedValues && !rule.allowedValues.includes(sanitized)) {
      errors.push(`${fieldName} must be one of: ${rule.allowedValues.join(', ')}`);
    }

    // Custom validator
    if (rule.customValidator && !rule.customValidator(sanitized)) {
      errors.push(`${fieldName} failed custom validation`);
    }

    return {
      valid: errors.length === 0,
      sanitized,
      errors,
      warnings
    };
  }

  // Type validation
  private validateType(fieldName: string, value: any, type?: string): ValidationResult {
    if (!type) return { valid: true, sanitized: value, errors: [], warnings: [] };

    const errors: string[] = [];
    let sanitized = value;

    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          sanitized = String(value);
        }
        break;

      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`${fieldName} must be a valid number`);
        } else {
          sanitized = num;
        }
        break;

      case 'boolean':
        if (typeof value === 'boolean') {
          sanitized = value;
        } else if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === '1') {
            sanitized = true;
          } else if (lower === 'false' || lower === '0') {
            sanitized = false;
          } else {
            errors.push(`${fieldName} must be a valid boolean`);
          }
        } else {
          errors.push(`${fieldName} must be a boolean`);
        }
        break;

      case 'email':
        if (typeof value === 'string' && this.patterns.email.test(value)) {
          sanitized = value.toLowerCase().trim();
        } else {
          errors.push(`${fieldName} must be a valid email address`);
        }
        break;

      case 'url':
        if (typeof value === 'string' && this.patterns.url.test(value)) {
          sanitized = value.trim();
        } else {
          errors.push(`${fieldName} must be a valid URL`);
        }
        break;

      case 'uuid':
        if (typeof value === 'string' && this.patterns.uuid.test(value)) {
          sanitized = value.toLowerCase();
        } else {
          errors.push(`${fieldName} must be a valid UUID`);
        }
        break;

      case 'json':
        if (typeof value === 'string') {
          try {
            sanitized = JSON.parse(value);
          } catch {
            errors.push(`${fieldName} must be valid JSON`);
          }
        } else if (typeof value === 'object') {
          sanitized = value;
        } else {
          errors.push(`${fieldName} must be valid JSON`);
        }
        break;

      default:
        errors.push(`Unknown validation type: ${type}`);
    }

    return { valid: errors.length === 0, sanitized, errors, warnings: [] };
  }

  // String validation and sanitization
  private validateString(fieldName: string, value: string, rule: ValidationRule): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let sanitized = value;

    // Length validation
    if (rule.minLength && sanitized.length < rule.minLength) {
      errors.push(`${fieldName} must be at least ${rule.minLength} characters long`);
    }

    if (rule.maxLength && sanitized.length > rule.maxLength) {
      errors.push(`${fieldName} must be no more than ${rule.maxLength} characters long`);
    }

    // Security sanitization
    if (rule.sanitize !== false) {
      const originalLength = sanitized.length;
      
      // Remove script tags
      sanitized = sanitized.replace(this.patterns.noScriptTags, '');
      
      // HTML encode dangerous characters
      sanitized = this.htmlEncode(sanitized);
      
      // Check for potential XSS
      if (this.patterns.xss.test(value)) {
        warnings.push(`${fieldName} contains potentially dangerous content`);
        this.logSecurityEvent('xss_attempt', { field: fieldName, value: value.substring(0, 100) });
      }
      
      // Check for potential SQL injection
      if (this.patterns.sqlInjection.test(value)) {
        warnings.push(`${fieldName} contains potentially dangerous SQL patterns`);
        this.logSecurityEvent('sql_injection_attempt', { field: fieldName, value: value.substring(0, 100) });
      }
      
      if (sanitized.length !== originalLength) {
        warnings.push(`${fieldName} was sanitized for security`);
      }
    }

    return { valid: errors.length === 0, sanitized, errors, warnings };
  }

  // Number validation
  private validateNumber(fieldName: string, value: number, rule: ValidationRule): ValidationResult {
    const errors: string[] = [];

    if (rule.min !== undefined && value < rule.min) {
      errors.push(`${fieldName} must be at least ${rule.min}`);
    }

    if (rule.max !== undefined && value > rule.max) {
      errors.push(`${fieldName} must be no more than ${rule.max}`);
    }

    return { valid: errors.length === 0, errors, warnings: [] };
  }

  // HTML encoding for XSS prevention
  private htmlEncode(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  // Predefined validation schemas for common use cases
  getMessageValidationSchema(): Record<string, ValidationRule> {
    return {
      content: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 4000,
        sanitize: true
      },
      roomId: {
        required: true,
        type: 'string',
        pattern: /^[A-Z0-9-]+$/,
        maxLength: 50
      },
      userId: {
        required: true,
        type: 'uuid'
      },
      messageType: {
        type: 'string',
        allowedValues: ['text', 'image', 'file', 'system']
      }
    };
  }

  getRoomValidationSchema(): Record<string, ValidationRule> {
    return {
      name: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 100,
        sanitize: true
      },
      shareCode: {
        required: true,
        type: 'string',
        pattern: /^[A-Z0-9-]+$/,
        minLength: 3,
        maxLength: 50
      },
      description: {
        type: 'string',
        maxLength: 500,
        sanitize: true
      },
      isPrivate: {
        type: 'boolean'
      }
    };
  }

  getUserValidationSchema(): Record<string, ValidationRule> {
    return {
      displayName: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 50,
        sanitize: true,
        pattern: this.patterns.alphanumericWithSpaces
      },
      email: {
        type: 'email'
      },
      avatar: {
        type: 'url'
      }
    };
  }

  // Security event logging
  private logSecurityEvent(event: string, context: any) {
    this.errorTracker.trackError('warning', 'security', `Input security event: ${event}`, {
      event,
      ...context,
      timestamp: new Date().toISOString()
    });

    console.log(`🛡️ Input Security Event [${event}]:`, context);
  }

  // Batch validation for arrays
  validateArray(data: any[], rules: Record<string, ValidationRule>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitized: any[] = [];

    if (!Array.isArray(data)) {
      return {
        valid: false,
        errors: ['Data must be an array'],
        warnings: []
      };
    }

    for (let i = 0; i < data.length; i++) {
      const itemResult = this.validate(data[i], rules);
      
      if (!itemResult.valid) {
        errors.push(`Item ${i}: ${itemResult.errors.join(', ')}`);
      }
      
      warnings.push(...itemResult.warnings.map(w => `Item ${i}: ${w}`));
      sanitized.push(itemResult.sanitized);
    }

    return {
      valid: errors.length === 0,
      sanitized,
      errors,
      warnings
    };
  }

  // Quick sanitization for untrusted input
  quickSanitize(input: string): string {
    if (typeof input !== 'string') return '';
    
    return this.htmlEncode(input)
      .replace(this.patterns.noScriptTags, '')
      .trim()
      .substring(0, 1000); // Limit length
  }
}

// Export singleton instance
export const inputValidator = InputValidator.getInstance();
export default inputValidator;