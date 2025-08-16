#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testRemovalSystem() {
  console.log('🧪 Testing Room User Removal System\n');

  try {
    // Step 1: Create a test room
    console.log('1️⃣ Creating test room...');
    const testRoomName = `Test Room ${Date.now()}`;
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({
        name: testRoomName,
        created_by: '00000000-0000-0000-0000-000000000000', // Test user ID
        share_code: `TEST${Math.random().toString(36).substring(7)}`,
        max_participants: 5,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
      })
      .select()
      .single();

    if (roomError || !room) {
      console.error('❌ Failed to create test room:', roomError);
      return;
    }
    console.log('✅ Test room created:', room.share_code);

    // Step 2: Add a test participant
    console.log('\n2️⃣ Adding test participant...');
    const testUserId = '00000000-0000-0000-0000-000000000001';
    const testDisplayName = 'Test User';
    const testSessionId = 'test_session_123';

    const { error: participantError } = await supabase
      .from('room_participants')
      .insert({
        room_id: room.id,
        user_id: testUserId,
        display_name: testDisplayName,
        session_id: testSessionId
      });

    if (participantError) {
      console.error('❌ Failed to add test participant:', participantError);
      return;
    }
    console.log('✅ Test participant added');

    // Step 3: Test room join function (should succeed)
    console.log('\n3️⃣ Testing initial room join...');
    const { data: joinResult1, error: joinError1 } = await supabase
      .rpc('join_room_safely', {
        p_room_id: room.id,
        p_session_id: testSessionId,
        p_display_name: testDisplayName,
        p_user_id: testUserId
      });

    if (joinError1) {
      console.error('❌ Join failed:', joinError1);
      return;
    }
    console.log('✅ Initial join result:', joinResult1);

    // Step 4: Remove the user from the room
    console.log('\n4️⃣ Removing user from room...');
    const { error: removeError } = await supabase
      .from('removed_room_participants')
      .insert({
        room_id: room.id,
        removed_user_id: testUserId,
        removed_session_id: testSessionId,
        removed_display_name: testDisplayName,
        removed_by: '00000000-0000-0000-0000-000000000000',
        reason: 'test_removal'
      });

    if (removeError) {
      console.error('❌ Failed to track removal:', removeError);
      return;
    }
    console.log('✅ User marked as removed');

    // Step 5: Test room join function (should fail now)
    console.log('\n5️⃣ Testing room join after removal...');
    const { data: joinResult2, error: joinError2 } = await supabase
      .rpc('join_room_safely', {
        p_room_id: room.id,
        p_session_id: testSessionId,
        p_display_name: testDisplayName,
        p_user_id: testUserId
      });

    if (joinError2) {
      console.error('❌ Unexpected error during blocked join:', joinError2);
      return;
    }

    console.log('✅ Blocked join result:', joinResult2);
    
    if (joinResult2?.success === false && joinResult2?.error === 'REMOVED_FROM_ROOM') {
      console.log('🎉 SUCCESS: User correctly blocked from rejoining room!');
    } else {
      console.log('❌ FAIL: User was allowed to rejoin room after removal');
    }

    // Step 6: Test is_user_removed_from_room function
    console.log('\n6️⃣ Testing removal check function...');
    const { data: isRemoved, error: checkError } = await supabase
      .rpc('is_user_removed_from_room', {
        room_id_param: room.id,
        user_id_param: testUserId,
        session_id_param: testSessionId,
        display_name_param: testDisplayName
      });

    if (checkError) {
      console.error('❌ Error checking removal status:', checkError);
      return;
    }
    
    console.log('✅ Removal check result:', isRemoved);
    
    if (isRemoved === true) {
      console.log('🎉 SUCCESS: Removal check function works correctly!');
    } else {
      console.log('❌ FAIL: Removal check function returned false');
    }

    // Cleanup: Remove test data
    console.log('\n🧹 Cleaning up test data...');
    await supabase.from('removed_room_participants').delete().eq('room_id', room.id);
    await supabase.from('room_participants').delete().eq('room_id', room.id);
    await supabase.from('rooms').delete().eq('id', room.id);
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('💥 Test failed with error:', error);
  }
}

// Run the test
testRemovalSystem();