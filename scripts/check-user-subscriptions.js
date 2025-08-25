#!/usr/bin/env node

/**
 * Check User Subscriptions Script
 * 
 * This script helps you check the subscription status of users in your database
 * Useful for verifying that Stripe webhooks are working correctly
 * 
 * Usage: node scripts/check-user-subscriptions.js [email]
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUserSubscriptions(targetEmail = null) {
  console.log('📊 Checking User Subscription Status...\n');

  try {
    let query = supabase
      .from('users')
      .select(`
        id,
        email,
        subscription_tier,
        stripe_customer_id,
        stripe_subscription_id,
        subscription_status,
        created_at,
        updated_at
      `);

    if (targetEmail) {
      query = query.eq('email', targetEmail);
    } else {
      query = query.limit(20); // Show recent 20 users
    }

    const { data: users, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }

    if (!users || users.length === 0) {
      if (targetEmail) {
        console.log(`❌ No user found with email: ${targetEmail}`);
      } else {
        console.log('❌ No users found in database');
      }
      return;
    }

    console.log(`📋 Found ${users.length} user(s):\n`);

    for (const user of users) {
      console.log(`👤 User: ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Tier: ${user.subscription_tier || 'free'} ${getTierEmoji(user.subscription_tier)}`);
      console.log(`   Status: ${user.subscription_status || 'inactive'} ${getStatusEmoji(user.subscription_status)}`);
      
      if (user.stripe_customer_id) {
        console.log(`   Stripe Customer: ${user.stripe_customer_id}`);
      } else {
        console.log(`   Stripe Customer: ❌ Not set`);
      }
      
      if (user.stripe_subscription_id) {
        console.log(`   Stripe Subscription: ${user.stripe_subscription_id}`);
      } else {
        console.log(`   Stripe Subscription: ❌ Not set`);
      }
      
      console.log(`   Created: ${new Date(user.created_at).toLocaleDateString()}`);
      console.log(`   Updated: ${new Date(user.updated_at || user.created_at).toLocaleDateString()}`);
      console.log('');
    }

    // Get tier statistics
    const tierStats = users.reduce((stats, user) => {
      const tier = user.subscription_tier || 'free';
      stats[tier] = (stats[tier] || 0) + 1;
      return stats;
    }, {});

    console.log('📈 Subscription Statistics:');
    Object.entries(tierStats).forEach(([tier, count]) => {
      console.log(`   ${tier}: ${count} user(s) ${getTierEmoji(tier)}`);
    });

    // Check for potential issues
    console.log('\n🔍 Health Check:');
    
    const usersWithSubscriptions = users.filter(u => u.subscription_tier && u.subscription_tier !== 'free');
    const usersWithoutStripeCustomer = usersWithSubscriptions.filter(u => !u.stripe_customer_id);
    const usersWithoutStripeSubscription = usersWithSubscriptions.filter(u => !u.stripe_subscription_id);
    
    if (usersWithoutStripeCustomer.length > 0) {
      console.log(`   ⚠️ ${usersWithoutStripeCustomer.length} paid user(s) missing Stripe customer ID`);
    }
    
    if (usersWithoutStripeSubscription.length > 0) {
      console.log(`   ⚠️ ${usersWithoutStripeSubscription.length} paid user(s) missing Stripe subscription ID`);
    }
    
    if (usersWithoutStripeCustomer.length === 0 && usersWithoutStripeSubscription.length === 0) {
      console.log('   ✅ All subscription data looks healthy!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

function getTierEmoji(tier) {
  switch (tier) {
    case 'free': return '🆓';
    case 'basic': return '💼';
    case 'premium': return '💎';
    default: return '❓';
  }
}

function getStatusEmoji(status) {
  switch (status) {
    case 'active': return '✅';
    case 'inactive': return '❌';
    case 'past_due': return '⚠️';
    case 'canceled': return '🚫';
    default: return '❓';
  }
}

// Check command line arguments
const targetEmail = process.argv[2];

if (targetEmail) {
  console.log(`🔍 Checking subscription for: ${targetEmail}\n`);
} else {
  console.log('📊 Checking recent user subscriptions (add email as argument to check specific user)\n');
}

// Check required environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nPlease check your .env.local file');
  process.exit(1);
}

checkUserSubscriptions(targetEmail);