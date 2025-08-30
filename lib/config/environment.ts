/**
 * Environment Configuration Utility
 * 
 * This module provides type-safe environment detection and URL configuration
 * for development vs production environments.
 */

export type Environment = 'development' | 'production' | 'test';

/**
 * Get the current environment
 */
export function getEnvironment(): Environment {
  const env = process.env.NODE_ENV as Environment;
  return env || 'development';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return getEnvironment() === 'development';
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return getEnvironment() === 'production';
}

/**
 * Get the base URL for the current environment
 */
export function getBaseUrl(): string {
  // In development, always use localhost
  if (isDevelopment()) {
    return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  }
  
  // In production, use the configured production URL
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.patioai.chat';
}

/**
 * Get environment-specific URLs
 */
export function getEnvironmentUrls() {
  const baseUrl = getBaseUrl();
  
  return {
    baseUrl,
    authCallback: `${baseUrl}/api/auth/callback`,
    authConfirm: `${baseUrl}/api/auth/confirm`,
    passwordReset: `${baseUrl}/redirect/auth-password-update`,
    socketUrl: isDevelopment() 
      ? process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'
      : process.env.NEXT_PUBLIC_SOCKET_URL || baseUrl,
  };
}

/**
 * Get Google OAuth configuration for current environment
 */
export function getGoogleOAuthConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_SECRET_ID!,
    redirectUri: `${getBaseUrl()}/api/auth/callback`,
  };
}

/**
 * Get Stripe configuration for current environment
 */
export function getStripeConfig() {
  return {
    secretKey: process.env.STRIPE_SECRET_KEY!,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    returnUrl: `${getBaseUrl()}/account?success=true`,
    cancelUrl: `${getBaseUrl()}/account?canceled=true`,
  };
}

/**
 * Development-only function to log environment info
 */
export function logEnvironmentInfo() {
  if (isDevelopment()) {
    console.log('🌍 Environment Configuration:');
    console.log('- Environment:', getEnvironment());
    console.log('- Base URL:', getBaseUrl());
    console.log('- Socket URL:', getEnvironmentUrls().socketUrl);
    console.log('- Google OAuth Redirect:', getGoogleOAuthConfig().redirectUri);
  }
}
