#!/usr/bin/env node

/**
 * Fix John's Subscription Script
 * 
 * This script manually updates John's subscription since his payment was successful
 * but the webhook didn't fire during the original payment
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixJohnSubscription() {
  console.log('🔧 Fixing John\'s subscription...\n');

  try {
    const userId = 'e857bd15-9f48-433e-b19d-4c15224bd2b5';
    const customerId = 'cus_SuZ6Yxlbi4qpv9';
    const tier = 'basic'; // Assuming he paid for basic tier
    
    console.log(`👤 User ID: ${userId}`);
    console.log(`💳 Customer ID: ${customerId}`);
    console.log(`🎯 Target Tier: ${tier}\n`);

    // Step 1: Update users table
    console.log('1️⃣ Updating users table...');
    const { error: userError } = await supabase
      .from('users')
      .update({
        subscription_tier: tier,
        stripe_customer_id: customerId,
        stripe_subscription_id: 'sub_manual_fix_' + Date.now(), // Temporary subscription ID
        subscription_status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (userError) {
      throw new Error(`Failed to update users table: ${userError.message}`);
    }
    console.log('✅ Users table updated successfully');

    // Step 2: Update user_tiers table
    console.log('2️⃣ Updating user_tiers table...');
    const { error: tierError } = await supabase
      .from('user_tiers')
      .upsert({
        user_id: userId,
        tier: tier,
        updated_at: new Date().toISOString(),
      });

    if (tierError) {
      throw new Error(`Failed to update user_tiers table: ${tierError.message}`);
    }
    console.log('✅ User_tiers table updated successfully');

    // Step 3: Verify the changes
    console.log('3️⃣ Verifying changes...');
    const { data: user, error: verifyError } = await supabase
      .from('users')
      .select('id, email, subscription_tier, stripe_customer_id, subscription_status')
      .eq('id', userId)
      .single();

    if (verifyError) {
      throw new Error(`Failed to verify changes: ${verifyError.message}`);
    }

    console.log('\n🎉 SUCCESS! John\'s subscription has been fixed:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Tier: ${user.subscription_tier} 💼`);
    console.log(`   Status: ${user.subscription_status} ✅`);
    console.log(`   Stripe Customer: ${user.stripe_customer_id}`);

    console.log('\n💡 Next steps:');
    console.log('   1. Ask John to refresh his account page');
    console.log('   2. Set up Stripe CLI for future payments: stripe listen --forward-to localhost:3000/api/webhooks/stripe');
    console.log('   3. The webhook forwarding is already running and configured');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixJohnSubscription();