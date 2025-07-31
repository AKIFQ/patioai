// Test the room chat API directly
const testRoomChatAPI = async () => {
  const testMessage = {
    messages: [
      {
        id: 'test-1',
        role: 'user',
        content: 'Test message from API test script'
      }
    ],
    displayName: 'API Test User',
    sessionId: 'test-session-123',
    option: 'gpt-4.1',
    chatSessionId: '3061bd00-e0c6-4980-9d0d-1c94aa0eb14b' // Use existing session
  };

  try {
    const response = await fetch('/api/rooms/STUDY-2025/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testMessage)
    });

    console.log('API Response status:', response.status);
    console.log('API Response headers:', response.headers);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', errorText);
      return;
    }

    console.log('✅ API call successful!');
    
    // Read the streaming response
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = new TextDecoder().decode(value);
        console.log('Stream chunk:', chunk);
      }
    }
  } catch (error) {
    console.error('❌ API call failed:', error);
  }
};

// Run the test
testRoomChatAPI();