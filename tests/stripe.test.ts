import { createCheckoutSession, createOrRetrieveCustomer, syncStripeSubscriptionToDatabase, getSubscriptionByCustomer } from '../lib/stripe/subscriptions';
import { getTierFromPriceId, getPriceIdForTier } from '../lib/stripe/server-config';
import Stripe from 'stripe';

// Mock the Stripe instance
const mockStripe = {
  customers: {
    create: jest.fn(),
    list: jest.fn(),
  },
  subscriptions: {
    list: jest.fn(),
  },
  checkout: {
    sessions: {
      create: jest.fn(),
    },
  },
};

// Mock the server config
jest.mock('../lib/stripe/server-config', () => ({
  stripe: mockStripe,
  getPriceIdForTier: jest.fn(),
  getTierFromPriceId: jest.fn(),
  STRIPE_PRICE_IDS: {
    basic: 'price_fake_basic',
    premium: 'price_fake_premium',
  },
}));

// Mock Supabase
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        limit: jest.fn(),
      })),
    })),
    update: jest.fn(() => ({
      eq: jest.fn(),
    })),
    upsert: jest.fn(),
  })),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe('Stripe Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    (getPriceIdForTier as jest.Mock).mockImplementation((tier) => {
      switch (tier) {
        case 'basic': return 'price_fake_basic';
        case 'premium': return 'price_fake_premium';
        case 'free': return null;
        default: return null;
      }
    });

    (getTierFromPriceId as jest.Mock).mockImplementation((priceId) => {
      switch (priceId) {
        case 'price_fake_basic': return 'basic';
        case 'price_fake_premium': return 'premium';
        default: return 'free';
      }
    });
  });

  describe('createOrRetrieveCustomer', () => {
    it('should create a new customer when none exists', async () => {
      const userId = 'test-user-123';
      const email = 'test@example.com';
      
      // Mock no existing customer
      mockStripe.customers.list.mockResolvedValue({
        data: [],
      });
      
      // Mock customer creation
      const mockCustomer = {
        id: 'cus_fake123',
        email,
        name: `User ${userId}`,
        metadata: { user_id: userId },
      };
      
      mockStripe.customers.create.mockResolvedValue(mockCustomer);
      
      // Mock database update
      mockSupabase.from().update().eq.mockResolvedValue({ error: null });
      
      const result = await createOrRetrieveCustomer(userId, email);
      
      expect(mockStripe.customers.list).toHaveBeenCalledWith({
        email,
        limit: 1,
      });
      
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email,
        name: `User ${userId}`,
        metadata: { user_id: userId },
      });
      
      expect(result).toEqual(mockCustomer);
    });

    it('should retrieve existing customer', async () => {
      const userId = 'test-user-123';
      const email = 'test@example.com';
      
      const mockCustomer = {
        id: 'cus_existing123',
        email,
      };
      
      // Mock existing customer
      mockStripe.customers.list.mockResolvedValue({
        data: [mockCustomer],
      });
      
      // Mock database update
      mockSupabase.from().update().eq.mockResolvedValue({ error: null });
      
      const result = await createOrRetrieveCustomer(userId, email);
      
      expect(mockStripe.customers.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockCustomer);
    });
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session for basic tier', async () => {
      const params = {
        userId: 'test-user-123',
        userEmail: 'test@example.com',
        tier: 'basic' as const,
        successUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/cancel',
      };
      
      const mockCustomer = { id: 'cus_fake123' };
      const mockSession = {
        id: 'cs_fake123',
        url: 'https://checkout.stripe.com/fake',
      };
      
      // Mock customer creation
      mockStripe.customers.list.mockResolvedValue({ data: [mockCustomer] });
      mockSupabase.from().update().eq.mockResolvedValue({ error: null });
      
      // Mock session creation
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);
      
      const result = await createCheckoutSession(params);
      
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer: mockCustomer.id,
        line_items: [
          {
            price: 'price_fake_basic',
            quantity: 1,
          },
        ],
        success_url: `${params.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: params.cancelUrl,
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        customer_update: {
          address: 'auto',
          name: 'auto',
        },
        metadata: {
          user_id: params.userId,
          tier: params.tier,
        },
        subscription_data: {
          metadata: {
            user_id: params.userId,
          },
        },
        payment_method_options: {
          card: {
            request_three_d_secure: 'automatic',
          },
        },
      });
      
      expect(result).toEqual(mockSession);
    });

    it('should throw error for free tier', async () => {
      const params = {
        userId: 'test-user-123',
        userEmail: 'test@example.com',
        tier: 'free' as const,
        successUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/cancel',
      };
      
      await expect(createCheckoutSession(params)).rejects.toThrow(
        'Cannot create checkout session for free tier'
      );
    });
  });

  describe('syncStripeSubscriptionToDatabase', () => {
    it('should sync active subscription to database', async () => {
      const userId = 'test-user-123';
      const customerId = 'cus_fake123';
      
      const mockSubscription = {
        id: 'sub_fake123',
        status: 'active',
        items: {
          data: [
            {
              price: {
                id: 'price_fake_basic',
              },
            },
          ],
        },
      };
      
      // Mock subscription retrieval
      mockStripe.subscriptions.list.mockResolvedValue({
        data: [mockSubscription],
      });
      
      // Mock database updates
      mockSupabase.from().update().eq.mockResolvedValue({ error: null });
      mockSupabase.from().upsert.mockResolvedValue({ error: null });
      
      await syncStripeSubscriptionToDatabase(userId, customerId);
      
      expect(mockStripe.subscriptions.list).toHaveBeenCalledWith({
        customer: customerId,
        status: 'all',
        limit: 1,
      });
      
      // Check users table update
      expect(mockSupabase.from).toHaveBeenCalledWith('users');
      
      // Check user_tiers table update
      expect(mockSupabase.from).toHaveBeenCalledWith('user_tiers');
    });

    it('should handle no subscription case', async () => {
      const userId = 'test-user-123';
      const customerId = 'cus_fake123';
      
      // Mock no subscriptions
      mockStripe.subscriptions.list.mockResolvedValue({
        data: [],
      });
      
      // Mock database updates
      mockSupabase.from().update().eq.mockResolvedValue({ error: null });
      mockSupabase.from().upsert.mockResolvedValue({ error: null });
      
      await syncStripeSubscriptionToDatabase(userId, customerId);
      
      // Should still update database with free tier
      expect(mockSupabase.from().update().eq).toHaveBeenCalled();
      expect(mockSupabase.from().upsert).toHaveBeenCalled();
    });
  });

  describe('getSubscriptionByCustomer', () => {
    it('should return subscription details for active subscription', async () => {
      const customerId = 'cus_fake123';
      const mockSubscription = {
        id: 'sub_fake123',
        status: 'active' as Stripe.Subscription.Status,
        current_period_start: 1640995200,
        current_period_end: 1643673600,
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: {
                id: 'price_fake_basic',
              },
            },
          ],
        },
      };
      
      mockStripe.subscriptions.list.mockResolvedValue({
        data: [mockSubscription],
      });
      
      const result = await getSubscriptionByCustomer(customerId);
      
      expect(result).toEqual({
        id: mockSubscription.id,
        status: mockSubscription.status,
        current_period_start: mockSubscription.current_period_start,
        current_period_end: mockSubscription.current_period_end,
        tier: 'basic',
        cancel_at_period_end: mockSubscription.cancel_at_period_end,
        price_id: 'price_fake_basic',
        customer_id: customerId,
      });
    });

    it('should return null for no active subscription', async () => {
      const customerId = 'cus_fake123';
      
      mockStripe.subscriptions.list.mockResolvedValue({
        data: [],
      });
      
      const result = await getSubscriptionByCustomer(customerId);
      
      expect(result).toBeNull();
    });
  });

  describe('Tier and Price ID mapping', () => {
    it('should correctly map tiers to price IDs', () => {
      expect(getPriceIdForTier('basic')).toBe('price_fake_basic');
      expect(getPriceIdForTier('premium')).toBe('price_fake_premium');
      expect(getPriceIdForTier('free')).toBeNull();
    });

    it('should correctly map price IDs to tiers', () => {
      expect(getTierFromPriceId('price_fake_basic')).toBe('basic');
      expect(getTierFromPriceId('price_fake_premium')).toBe('premium');
      expect(getTierFromPriceId('unknown_price')).toBe('free');
    });
  });
});