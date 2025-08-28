// Email validation utilities
export const validateEmail = (email: string) => {
  if (!email.trim()) {
    return { isValid: false, message: 'Email is required' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, message: 'Please enter a valid email address' };
  }
  
  // Check for common email providers for better UX
  const commonProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
  const domain = email.split('@')[1]?.toLowerCase();
  
  if (domain && !commonProviders.includes(domain) && !domain.includes('.')) {
    return { isValid: false, message: 'Please check your email domain' };
  }
  
  return { isValid: true, message: '' };
};

export const validatePassword = (password: string) => {
  const requirements = {
    length: password.length >= 6,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  };
  
  const errors = [];
  if (!requirements.length) errors.push('At least 6 characters');
  if (!requirements.number) errors.push('One number');
  
  const strength = Object.values(requirements).filter(Boolean).length;
  let strengthLevel: 'weak' | 'fair' | 'good' | 'strong' = 'weak';
  
  if (strength >= 4) strengthLevel = 'strong';
  else if (strength >= 3) strengthLevel = 'good';
  else if (strength >= 2) strengthLevel = 'fair';
  
  return {
    isValid: errors.length === 0,
    requirements,
    errors,
    strength: strengthLevel,
    score: strength
  };
};

export const validateFullName = (name: string) => {
  if (!name.trim()) {
    return { isValid: false, message: 'Full name is required' };
  }
  
  if (name.length < 2) {
    return { isValid: false, message: 'Name must be at least 2 characters' };
  }
  
  if (name.length > 50) {
    return { isValid: false, message: 'Name must be less than 50 characters' };
  }
  
  const nameRegex = /^[a-zA-Z\s'-]+$/;
  if (!nameRegex.test(name)) {
    return { isValid: false, message: 'Name can only contain letters, spaces, hyphens, and apostrophes' };
  }
  
  return { isValid: true, message: '' };
};

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};
