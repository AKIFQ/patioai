// Simple test to verify room database connection
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wgpfyizeiqmtfnrjskzf.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndncGZ5aXplaXFtdGZucmpza3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5NzQwMDksImV4cCI6MjA2ODU1MDAwOX0.boYya75EKBonsvXqA_1RJdpcOdh9SFYxG3awebaZ3iU";

console.log('Supabase URL:', SUPABASE_URL ? 'Set' : 'Missing');
console.log('Supabase Key:', SUPABASE_ANON_KEY ? 'Set' : 'Missing');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testRoomConnection() {
  console.log('Testing room database connection...');
  
  try {
    // Test 1: Check if rooms table exists
    console.log('\n1. Testing rooms table access...');
    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('*')
      .limit(1);
    
    if (roomsError) {
      console.error('❌ Rooms table error:', roomsError);
    } else {
      console.log('✅ Rooms table accessible, found', rooms?.length || 0, 'rooms');
    }

    // Test 2: Check specific room
    console.log('\n2. Testing specific room lookup...');
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, name, share_code')
      .eq('share_code', 'STUDY-2025')
      .single();
    
    if (roomError) {
      console.error('❌ Room lookup error:', roomError);
    } else {
      console.log('✅ Found room:', room);
    }

    // Test 3: Check room_messages table
    console.log('\n3. Testing room_messages table...');
    const { data: messages, error: messagesError } = await supabase
      .from('room_messages')
      .select('*')
      .limit(1);
    
    if (messagesError) {
      console.error('❌ Room messages table error:', messagesError);
    } else {
      console.log('✅ Room messages table accessible, found', messages?.length || 0, 'messages');
    }

    // Test 4: Test realtime connection
    console.log('\n4. Testing realtime connection...');
    const channel = supabase
      .channel('test_channel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'room_messages'
      }, (payload) => {
        console.log('📡 Realtime message received:', payload);
      })
      .subscribe((status) => {
        console.log('📡 Realtime status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime connection successful');
          setTimeout(() => {
            supabase.removeChannel(channel);
            process.exit(0);
          }, 2000);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime connection failed');
          process.exit(1);
        }
      });

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testRoomConnection();