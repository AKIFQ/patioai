// Test script to verify anonymous user sidebar functionality
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAnonymousSidebar() {
  console.log('🧪 Testing Anonymous User Sidebar Functionality');
  
  try {
    // 0. Get or create a test user for room creation
    console.log('0. Getting test user...');
    let { data: users } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    let testUserId;
    if (users && users.length > 0) {
      testUserId = users[0].id;
      console.log('✅ Using existing user:', testUserId);
    } else {
      // Create a test user
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          email: 'test@example.com',
          full_name: 'Test User'
        })
        .select('id')
        .single();
      
      if (userError) {
        console.error('❌ Failed to create test user:', userError);
        return;
      }
      testUserId = newUser.id;
      console.log('✅ Created test user:', testUserId);
    }

    // 1. Create a test room
    console.log('1. Creating test room...');
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({
        name: 'Test Room for Anonymous',
        share_code: 'TEST_ANON_' + Date.now(),
        max_participants: 10,
        creator_tier: 'free',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
        created_by: testUserId
      })
      .select()
      .single();

    if (roomError) {
      console.error('❌ Failed to create test room:', roomError);
      return;
    }

    console.log('✅ Test room created:', room.share_code);

    // 2. Add anonymous participant
    console.log('2. Adding anonymous participant...');
    const displayName = 'TestAnonymousUser';
    const { error: participantError } = await supabase
      .from('room_participants')
      .insert({
        room_id: room.id,
        session_id: displayName,
        display_name: displayName,
        user_id: null
      });

    if (participantError) {
      console.error('❌ Failed to add participant:', participantError);
      return;
    }

    console.log('✅ Anonymous participant added');

    // 3. Create some test messages in different threads
    console.log('3. Creating test messages...');
    const { randomUUID } = require('crypto');
    const thread1Id = randomUUID();
    const thread2Id = randomUUID();

    const messages = [
      {
        room_id: room.id,
        thread_id: thread1Id,
        content: 'Hello, this is the first message in thread 1',
        sender_name: displayName,
        is_ai_response: false,
        created_at: new Date().toISOString()
      },
      {
        room_id: room.id,
        thread_id: thread1Id,
        content: 'AI response to thread 1',
        sender_name: 'AI',
        is_ai_response: true,
        created_at: new Date(Date.now() + 1000).toISOString()
      },
      {
        room_id: room.id,
        thread_id: thread2Id,
        content: 'This is a different conversation thread',
        sender_name: displayName,
        is_ai_response: false,
        created_at: new Date(Date.now() + 2000).toISOString()
      }
    ];

    const { error: messagesError } = await supabase
      .from('room_messages')
      .insert(messages);

    if (messagesError) {
      console.error('❌ Failed to create test messages:', messagesError);
      return;
    }

    console.log('✅ Test messages created');

    // 4. Test the threads API endpoint
    console.log('4. Testing threads API endpoint...');
    const response = await fetch(
      `http://localhost:3000/api/rooms/${room.share_code}/threads?displayName=${encodeURIComponent(displayName)}`
    );

    if (!response.ok) {
      console.error('❌ Threads API failed:', response.status, await response.text());
      return;
    }

    const threadsData = await response.json();
    console.log('✅ Threads API response:', JSON.stringify(threadsData, null, 2));

    // 5. Verify the response structure
    if (threadsData.threads && threadsData.threads.length === 2) {
      console.log('✅ Correct number of threads returned');
      
      const thread1 = threadsData.threads.find(t => t.threadId === thread1Id);
      const thread2 = threadsData.threads.find(t => t.threadId === thread2Id);
      
      if (thread1 && thread2) {
        console.log('✅ Both threads found in response');
        console.log('Thread 1 title:', thread1.firstMessage);
        console.log('Thread 2 title:', thread2.firstMessage);
      } else {
        console.error('❌ Missing threads in response');
      }
    } else {
      console.error('❌ Unexpected number of threads:', threadsData.threads?.length);
    }

    // 6. Clean up
    console.log('6. Cleaning up test data...');
    await supabase.from('room_messages').delete().eq('room_id', room.id);
    await supabase.from('room_participants').delete().eq('room_id', room.id);
    await supabase.from('rooms').delete().eq('id', room.id);
    console.log('✅ Test data cleaned up');

    console.log('🎉 Anonymous sidebar test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testAnonymousSidebar();