// Simple test to verify realtime is working
// Run this in browser console on both tabs

const testRealtime = async () => {
  const { createClient } = await import('./lib/client/client.js');
  const supabase = createClient();
  
  const roomId = '155676be-6594-4734-be7f-14d9004e9daf'; // STUDY-2025 room
  
  console.log('🔄 Setting up realtime test...');
  
  const channel = supabase
    .channel(`test_${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'room_messages',
        filter: `room_id=eq.${roomId}`
      },
      (payload) => {
        console.log('🎉 REALTIME MESSAGE RECEIVED:', payload.new);
      }
    )
    .subscribe((status) => {
      console.log('📡 Channel status:', status);
      
      if (status === 'SUBSCRIBED') {
        console.log('✅ Realtime test ready! Try sending a message in the chat.');
      }
    });
    
  return channel;
};

// Run the test
testRealtime();