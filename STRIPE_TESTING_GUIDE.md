# Stripe Testing Guide

This guide will help you test the Stripe integration in development using Stripe's test mode and sandbox.

## Prerequisites

1. **Stripe Account**: Sign up for a free Stripe account at https://stripe.com
2. **Test API Keys**: Get your test API keys from the Stripe Dashboard
3. **Environment Setup**: Configure your `.env.local` file with test keys

## Environment Variables Setup

Create or update your `.env.local` file with these test values:

```bash
# Stripe Test API Keys (get these from Stripe Dashboard -> Developers -> API Keys)
STRIPE_SECRET_KEY=sk_test_... # Your test secret key
STRIPE_PUBLISHABLE_KEY=pk_test_... # Your test publishable key
STRIPE_WEBHOOK_SECRET=whsec_... # Webhook endpoint secret (for local testing)

# Stripe Product/Price IDs (create these in Stripe Dashboard -> Products)
STRIPE_BASIC_PRICE_ID=price_... # Basic tier price ID ($10/month)
STRIPE_PREMIUM_PRICE_ID=price_... # Premium tier price ID ($50/month)

# Other required environment variables
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Setting Up Test Products in Stripe

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test/products)
2. Click "Add Product"
3. Create two products:

### Basic Tier Product
- **Name**: "Basic Plan"
- **Description**: "Basic tier subscription"
- **Pricing**: 
  - Price: $10.00
  - Billing period: Monthly
  - Currency: USD
- Copy the Price ID (starts with `price_`) and add it to `STRIPE_BASIC_PRICE_ID`

### Premium Tier Product
- **Name**: "Premium Plan"
- **Description**: "Premium tier subscription"
- **Pricing**: 
  - Price: $50.00
  - Billing period: Monthly
  - Currency: USD
- Copy the Price ID (starts with `price_`) and add it to `STRIPE_PREMIUM_PRICE_ID`

## Running Tests

### 1. Unit Tests
Run the Stripe integration tests:

```bash
# Run all tests
npm test

# Run only Stripe tests
npm run test:stripe

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### 2. Manual Testing in Development

#### Test Checkout Flow

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Create a test user** (if not already done):
   - Go to `http://localhost:3000/signin`
   - Sign up with a test email

3. **Test subscription upgrade**:
   - Go to `http://localhost:3000/account`
   - Click "Upgrade to Basic" or "Upgrade to Premium"
   - You'll be redirected to Stripe Checkout

4. **Use Stripe test cards**:
   - **Successful payment**: `4242 4242 4242 4242`
   - **Declined payment**: `4000 0000 0000 0002`
   - **3D Secure required**: `4000 0027 6000 3184`
   - Use any future expiry date (e.g., 12/34)
   - Use any 3-digit CVC (e.g., 123)

#### Test Webhook Events

1. **Install Stripe CLI** (for local webhook testing):
   ```bash
   brew install stripe/stripe-cli/stripe
   # or download from https://github.com/stripe/stripe-cli/releases
   ```

2. **Login to Stripe CLI**:
   ```bash
   stripe login
   ```

3. **Forward webhooks to your local server**:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

4. **Get the webhook signing secret**:
   The CLI will display a webhook signing secret (starts with `whsec_`). Add this to your `STRIPE_WEBHOOK_SECRET` environment variable.

5. **Test webhook events**:
   ```bash
   # Test checkout completion
   stripe trigger checkout.session.completed

   # Test subscription creation
   stripe trigger customer.subscription.created

   # Test payment success
   stripe trigger invoice.payment_succeeded

   # Test payment failure
   stripe trigger invoice.payment_failed
   ```

## Testing User Tier Upgrades

### Verify Database Changes

After a successful checkout, verify that the user's tier is updated in the database:

1. **Check Supabase Dashboard**:
   - Go to your Supabase project dashboard
   - Navigate to Table Editor -> `users` table
   - Find your test user and verify:
     - `subscription_tier` is updated (e.g., 'basic', 'premium')
     - `stripe_customer_id` is populated
     - `stripe_subscription_id` is populated
     - `subscription_status` is 'active'

2. **Check `user_tiers` table**:
   - Navigate to Table Editor -> `user_tiers` table
   - Verify the user's tier is correctly set

### Test Subscription Management

1. **Customer Portal**:
   - In your app, go to Account page
   - Click "Manage Billing" to access Stripe Customer Portal
   - Test canceling, updating payment methods, etc.

2. **Webhook Processing**:
   - Watch the server logs for webhook processing
   - Verify that subscription changes trigger database updates

## Test Scenarios to Cover

### Happy Path
1. ✅ User signs up for free account
2. ✅ User upgrades to Basic tier
3. ✅ Payment succeeds, user tier is updated
4. ✅ User can access Basic tier features
5. ✅ User upgrades to Premium tier
6. ✅ User can access Premium tier features

### Error Scenarios
1. ❌ Payment fails during checkout
2. ❌ Webhook signature validation fails
3. ❌ User not found during webhook processing
4. ❌ Invalid price ID
5. ❌ Stripe API rate limiting

### Edge Cases
1. 🔄 User cancels subscription
2. 🔄 Payment fails after successful subscription
3. 🔄 Multiple subscription attempts
4. 🔄 Webhook retry scenarios

## Debugging Tips

### Common Issues

1. **"Invalid API Key"**:
   - Ensure you're using test keys (start with `sk_test_` and `pk_test_`)
   - Check that keys are correctly set in `.env.local`

2. **"No such price"**:
   - Verify price IDs in Stripe Dashboard
   - Ensure price IDs are correctly set in environment variables

3. **Webhook signature verification failed**:
   - Use Stripe CLI for local testing
   - Ensure `STRIPE_WEBHOOK_SECRET` matches the CLI output

4. **User tier not updating**:
   - Check server logs for webhook processing errors
   - Verify database RLS policies allow updates
   - Check Supabase connection in webhook handler

### Monitoring

1. **Stripe Dashboard**:
   - Monitor payments in Stripe Dashboard -> Payments
   - Check webhook deliveries in Developers -> Webhooks
   - View customer subscriptions in Customers

2. **Application Logs**:
   - Watch server console for webhook processing logs
   - Check browser console for client-side errors
   - Monitor Supabase logs for database issues

## Production Considerations

When moving to production:

1. **Switch to live API keys**:
   - Replace test keys with live keys
   - Update webhook endpoints to production URLs

2. **Webhook endpoints**:
   - Configure production webhook endpoints in Stripe Dashboard
   - Use the live webhook signing secret

3. **Testing in production**:
   - Use real payment methods for testing
   - Test with small amounts first
   - Monitor webhook delivery in production

## Security Checklist

- ✅ Never commit API keys to version control
- ✅ Use environment variables for all secrets
- ✅ Validate webhook signatures
- ✅ Use HTTPS in production
- ✅ Implement proper error handling
- ✅ Log webhook events for auditing
- ✅ Verify customer ownership before operations

## Support Resources

- [Stripe Testing Documentation](https://stripe.com/docs/testing)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)
- [Webhook Testing Guide](https://stripe.com/docs/webhooks/test)
- [Test Card Numbers](https://stripe.com/docs/testing#cards)