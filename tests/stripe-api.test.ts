import { NextRequest } from 'next/server';
import { POST as checkoutPOST } from '../app/api/subscriptions/checkout/route';
import { POST as portalPOST } from '../app/api/subscriptions/portal/route';

// Mock Stripe functions
jest.mock('../lib/stripe/subscriptions', () => ({
  createCheckoutSession: jest.fn(),
  createCustomerPortalSession: jest.fn(),
}));

// Mock Supabase
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
  })),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe('Stripe API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('/api/subscriptions/checkout', () => {
    it('should create checkout session successfully', async () => {
      const requestBody = {
        tier: 'basic',
        userId: 'test-user-123',
      };
      
      const mockRequest = {
        json: jest.fn().mockResolvedValue(requestBody),
      } as any;
      
      // Mock user lookup
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { email: 'test@example.com' },
        error: null,
      });
      
      // Mock checkout session creation
      const { createCheckoutSession } = require('../lib/stripe/subscriptions');
      createCheckoutSession.mockResolvedValue({
        id: 'cs_fake123',
        url: 'https://checkout.stripe.com/fake',
      });
      
      const response = await checkoutPOST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.sessionId).toBe('cs_fake123');
      expect(data.url).toBe('https://checkout.stripe.com/fake');
      
      expect(createCheckoutSession).toHaveBeenCalledWith({
        userId: 'test-user-123',
        userEmail: 'test@example.com',
        tier: 'basic',
        successUrl: expect.stringContaining('/account?success=true'),
        cancelUrl: expect.stringContaining('/account?cancelled=true'),
      });
    });

    it('should reject request with missing fields', async () => {
      const requestBody = {
        tier: 'basic',
        // Missing userId
      };
      
      const mockRequest = {
        json: jest.fn().mockResolvedValue(requestBody),
      } as any;
      
      const response = await checkoutPOST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required fields: tier, userId');
    });

    it('should reject free tier', async () => {
      const requestBody = {
        tier: 'free',
        userId: 'test-user-123',
      };
      
      const mockRequest = {
        json: jest.fn().mockResolvedValue(requestBody),
      } as any;
      
      const response = await checkoutPOST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot create checkout for free tier');
    });

    it('should handle user not found', async () => {
      const requestBody = {
        tier: 'basic',
        userId: 'non-existent-user',
      };
      
      const mockRequest = {
        json: jest.fn().mockResolvedValue(requestBody),
      } as any;
      
      // Mock user not found
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: { message: 'User not found' },
      });
      
      const response = await checkoutPOST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(404);
      expect(data.error).toBe('User not found');
    });

    it('should handle Stripe errors', async () => {
      const requestBody = {
        tier: 'basic',
        userId: 'test-user-123',
      };
      
      const mockRequest = {
        json: jest.fn().mockResolvedValue(requestBody),
      } as any;
      
      // Mock user lookup
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { email: 'test@example.com' },
        error: null,
      });
      
      // Mock Stripe error
      const { createCheckoutSession } = require('../lib/stripe/subscriptions');
      createCheckoutSession.mockRejectedValue(new Error('Stripe error'));
      
      const response = await checkoutPOST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create checkout session');
    });
  });

  describe('/api/subscriptions/portal', () => {
    it('should create customer portal session successfully', async () => {
      const requestBody = {
        userId: 'test-user-123',
      };
      
      const mockRequest = {
        json: jest.fn().mockResolvedValue(requestBody),
      } as any;
      
      // Mock user lookup with Stripe customer ID
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { stripe_customer_id: 'cus_fake123' },
        error: null,
      });
      
      // Mock portal session creation
      const { createCustomerPortalSession } = require('../lib/stripe/subscriptions');
      createCustomerPortalSession.mockResolvedValue({
        url: 'https://billing.stripe.com/fake',
      });
      
      const response = await portalPOST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.url).toBe('https://billing.stripe.com/fake');
      
      expect(createCustomerPortalSession).toHaveBeenCalledWith(
        'cus_fake123',
        expect.stringContaining('/account')
      );
    });

    it('should reject request with missing userId', async () => {
      const requestBody = {};
      
      const mockRequest = {
        json: jest.fn().mockResolvedValue(requestBody),
      } as any;
      
      const response = await portalPOST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required field: userId');
    });

    it('should handle user without Stripe customer', async () => {
      const requestBody = {
        userId: 'test-user-123',
      };
      
      const mockRequest = {
        json: jest.fn().mockResolvedValue(requestBody),
      } as any;
      
      // Mock user without Stripe customer ID
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { stripe_customer_id: null },
        error: null,
      });
      
      const response = await portalPOST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(404);
      expect(data.error).toBe('User has no Stripe customer record');
    });

    it('should handle user not found', async () => {
      const requestBody = {
        userId: 'non-existent-user',
      };
      
      const mockRequest = {
        json: jest.fn().mockResolvedValue(requestBody),
      } as any;
      
      // Mock user not found
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: { message: 'User not found' },
      });
      
      const response = await portalPOST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(404);
      expect(data.error).toBe('User has no Stripe customer record');
    });

    it('should handle Stripe errors', async () => {
      const requestBody = {
        userId: 'test-user-123',
      };
      
      const mockRequest = {
        json: jest.fn().mockResolvedValue(requestBody),
      } as any;
      
      // Mock user lookup
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: { stripe_customer_id: 'cus_fake123' },
        error: null,
      });
      
      // Mock Stripe error
      const { createCustomerPortalSession } = require('../lib/stripe/subscriptions');
      createCustomerPortalSession.mockRejectedValue(new Error('Stripe error'));
      
      const response = await portalPOST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create customer portal session');
    });
  });
});