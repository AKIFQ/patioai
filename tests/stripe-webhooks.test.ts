import { NextRequest } from 'next/server';
import { POST } from '../app/api/webhooks/stripe/route';
import Stripe from 'stripe';

// Mock the Stripe webhook verification
const mockStripe = {
  webhooks: {
    constructEvent: jest.fn(),
  },
  subscriptions: {
    list: jest.fn(),
  },
};

jest.mock('../lib/stripe/server-config', () => ({
  stripe: mockStripe,
  STRIPE_WEBHOOK_SECRET: 'whsec_fake_secret',
  getTierFromPriceId: jest.fn((priceId) => {
    switch (priceId) {
      case 'price_fake_basic': return 'basic';
      case 'price_fake_premium': return 'premium';
      default: return 'free';
    }
  }),
}));

// Mock the sync function
jest.mock('../lib/stripe/subscriptions', () => ({
  syncStripeSubscriptionToDatabase: jest.fn(),
}));

// Mock Supabase
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        limit: jest.fn(() => ({
          data: [{ id: 'test-user-123' }],
        })),
      })),
    })),
  })),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

// Mock headers
jest.mock('next/headers', () => ({
  headers: jest.fn(() => ({
    get: jest.fn((header) => {
      if (header === 'stripe-signature') {
        return 'fake_signature';
      }
      return null;
    }),
  })),
}));

describe('Stripe Webhook Tests', () => {
  let mockRequest: NextRequest;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock request
    const mockBody = JSON.stringify({ type: 'checkout.session.completed' });
    mockRequest = {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(mockBody));
          controller.close();
        },
      }),
    } as any;
  });

  describe('Webhook signature verification', () => {
    it('should reject requests without signature', async () => {
      // Mock headers to return no signature
      const { headers } = require('next/headers');
      headers().get.mockReturnValue(null);
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('No signature');
    });

    it('should reject requests with invalid signature', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid signature');
    });
  });

  describe('Checkout session completed', () => {
    it('should handle successful checkout completion', async () => {
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_fake123',
            customer: 'cus_fake123',
            metadata: {
              user_id: 'test-user-123',
            },
          },
        },
      };
      
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      
      const { syncStripeSubscriptionToDatabase } = require('../lib/stripe/subscriptions');
      syncStripeSubscriptionToDatabase.mockResolvedValue();
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
      expect(syncStripeSubscriptionToDatabase).toHaveBeenCalledWith(
        'test-user-123',
        'cus_fake123'
      );
    });

    it('should handle checkout completion with missing user_id', async () => {
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_fake123',
            customer: 'cus_fake123',
            metadata: {}, // No user_id
          },
        },
      };
      
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
    });

    it('should handle checkout completion with invalid customer ID', async () => {
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_fake123',
            customer: null, // Invalid customer ID
            metadata: {
              user_id: 'test-user-123',
            },
          },
        },
      };
      
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
    });
  });

  describe('Subscription events', () => {
    it('should handle subscription created', async () => {
      const mockEvent = {
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_fake123',
            customer: 'cus_fake123',
            status: 'active',
          },
        },
      };
      
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      
      const { syncStripeSubscriptionToDatabase } = require('../lib/stripe/subscriptions');
      syncStripeSubscriptionToDatabase.mockResolvedValue();
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
      expect(syncStripeSubscriptionToDatabase).toHaveBeenCalledWith(
        'test-user-123',
        'cus_fake123'
      );
    });

    it('should handle subscription updated', async () => {
      const mockEvent = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_fake123',
            customer: 'cus_fake123',
            status: 'past_due',
          },
        },
      };
      
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      
      const { syncStripeSubscriptionToDatabase } = require('../lib/stripe/subscriptions');
      syncStripeSubscriptionToDatabase.mockResolvedValue();
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
    });

    it('should handle subscription deleted', async () => {
      const mockEvent = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_fake123',
            customer: 'cus_fake123',
            status: 'canceled',
          },
        },
      };
      
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      
      const { syncStripeSubscriptionToDatabase } = require('../lib/stripe/subscriptions');
      syncStripeSubscriptionToDatabase.mockResolvedValue();
      
      const response = await POST(mockRequest);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Payment events', () => {
    it('should handle payment succeeded', async () => {
      const mockEvent = {
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_fake123',
            customer: 'cus_fake123',
            amount_paid: 1000,
          },
        },
      };
      
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      
      const { syncStripeSubscriptionToDatabase } = require('../lib/stripe/subscriptions');
      syncStripeSubscriptionToDatabase.mockResolvedValue();
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
    });

    it('should handle payment failed', async () => {
      const mockEvent = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_fake123',
            customer: 'cus_fake123',
            amount_due: 1000,
          },
        },
      };
      
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      
      const { syncStripeSubscriptionToDatabase } = require('../lib/stripe/subscriptions');
      syncStripeSubscriptionToDatabase.mockResolvedValue();
      
      const response = await POST(mockRequest);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Event filtering', () => {
    it('should ignore unhandled event types', async () => {
      const mockEvent = {
        type: 'customer.updated', // Not in allowed events
        data: {
          object: {
            id: 'cus_fake123',
          },
        },
      };
      
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should return 500 on processing errors', async () => {
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_fake123',
            customer: 'cus_fake123',
            metadata: {
              user_id: 'test-user-123',
            },
          },
        },
      };
      
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      
      const { syncStripeSubscriptionToDatabase } = require('../lib/stripe/subscriptions');
      syncStripeSubscriptionToDatabase.mockRejectedValue(new Error('Database error'));
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data.error).toBe('Webhook processing failed');
    });
  });
});