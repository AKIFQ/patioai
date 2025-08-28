#!/usr/bin/env node

/**
 * DeepSeek R1 Reasoning Test Script
 * 
 * This script tests the complete reasoning flow from OpenRouter API to frontend UI
 * to identify where the reasoning events are getting lost.
 */

const io = require('socket.io-client');
const fetch = require('node-fetch');

// Configuration
const TEST_CONFIG = {
  roomShareCode: '2DFF82EDCC40', // Use existing room
  threadId: '0b599a9f-c01b-4465-8704-966e757e7ac5', // Use existing thread
  displayName: 'TEST_USER',
  sessionId: 'test-session-' + Date.now(),
  modelId: 'deepseek/deepseek-r1',
  testMessage: 'Explain quantum computing in simple terms'
};

// Test phases
const TEST_PHASES = {
  SOCKET_CONNECTION: 'Socket.IO Connection',
  ROOM_JOIN: 'Room Join',
  MESSAGE_SUBMISSION: 'Message Submission',
  REASONING_EVENTS: 'Reasoning Events',
  FRONTEND_INTEGRATION: 'Frontend Integration'
};

class DeepSeekReasoningTester {
  constructor() {
    this.socket = null;
    this.testResults = {};
    this.eventLog = [];
    this.reasoningEvents = [];
    this.streamEvents = [];
  }

  log(message, phase = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${phase}] ${message}`;
    console.log(logEntry);
    this.eventLog.push(logEntry);
  }

  async runTests() {
    this.log('🚀 Starting DeepSeek R1 Reasoning Test Suite', 'START');
    this.log(`Test Config: ${JSON.stringify(TEST_CONFIG, null, 2)}`, 'CONFIG');

    try {
      await this.testSocketConnection();
      await this.testRoomJoin();
      await this.testMessageSubmission();
      await this.testReasoningEvents();
      await this.analyzeResults();
    } catch (error) {
      this.log(`❌ Test failed: ${error.message}`, 'ERROR');
      console.error(error);
    } finally {
      await this.cleanup();
    }
  }

  async testSocketConnection() {
    this.log('🔌 Testing Socket.IO connection...', TEST_PHASES.SOCKET_CONNECTION);
    
    return new Promise((resolve, reject) => {
      this.socket = io('http://localhost:3000', {
        transports: ['websocket'],
        timeout: 5000
      });

      const timeout = setTimeout(() => {
        reject(new Error('Socket connection timeout'));
      }, 10000);

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this.log('✅ Socket.IO connected successfully', TEST_PHASES.SOCKET_CONNECTION);
        this.testResults.socketConnected = true;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        this.log(`❌ Socket connection failed: ${error.message}`, TEST_PHASES.SOCKET_CONNECTION);
        reject(error);
      });
    });
  }

  async testRoomJoin() {
    this.log('🚪 Testing room join...', TEST_PHASES.ROOM_JOIN);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Room join timeout'));
      }, 10000);

      this.socket.emit('join-room', {
        shareCode: TEST_CONFIG.roomShareCode,
        displayName: TEST_CONFIG.displayName,
        sessionId: TEST_CONFIG.sessionId
      });

      this.socket.on('room-joined', (data) => {
        clearTimeout(timeout);
        this.log('✅ Room joined successfully', TEST_PHASES.ROOM_JOIN);
        this.log(`Room data: ${JSON.stringify(data, null, 2)}`, TEST_PHASES.ROOM_JOIN);
        this.testResults.roomJoined = true;
        resolve();
      });

      this.socket.on('room-error', (error) => {
        clearTimeout(timeout);
        this.log(`❌ Room join failed: ${JSON.stringify(error)}`, TEST_PHASES.ROOM_JOIN);
        reject(new Error(`Room join failed: ${error.error || 'Unknown error'}`));
      });
    });
  }

  async testMessageSubmission() {
    this.log('📤 Testing message submission...', TEST_PHASES.MESSAGE_SUBMISSION);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Message submission timeout'));
      }, 15000);

      // Set up event listeners for all possible events
      this.setupEventListeners();

      // Submit the test message
      this.socket.emit('invoke-ai', {
        shareCode: TEST_CONFIG.roomShareCode,
        threadId: TEST_CONFIG.threadId,
        prompt: TEST_CONFIG.testMessage,
        roomName: 'Test Room',
        participants: [TEST_CONFIG.displayName],
        modelId: TEST_CONFIG.modelId,
        chatHistory: [],
        reasoningMode: true
      });

      // Wait for stream to complete
      setTimeout(() => {
        clearTimeout(timeout);
        this.log('✅ Message submission test completed', TEST_PHASES.MESSAGE_SUBMISSION);
        this.testResults.messageSubmitted = true;
        resolve();
      }, 12000); // Wait 12 seconds for complete stream
    });
  }

  setupEventListeners() {
    this.log('👂 Setting up event listeners...', TEST_PHASES.REASONING_EVENTS);

    // AI Stream Events
    this.socket.on('ai-stream-start', (data) => {
      this.log(`📡 AI Stream Start: ${JSON.stringify(data)}`, TEST_PHASES.REASONING_EVENTS);
      this.streamEvents.push({ type: 'ai-stream-start', data, timestamp: Date.now() });
    });

    this.socket.on('ai-stream-chunk', (data) => {
      this.log(`📡 AI Stream Chunk: ${data.chunk?.substring(0, 100)}...`, TEST_PHASES.REASONING_EVENTS);
      this.streamEvents.push({ type: 'ai-stream-chunk', data, timestamp: Date.now() });
    });

    this.socket.on('ai-stream-end', (data) => {
      this.log(`📡 AI Stream End: ${JSON.stringify(data)}`, TEST_PHASES.REASONING_EVENTS);
      this.streamEvents.push({ type: 'ai-stream-end', data, timestamp: Date.now() });
    });

    // Reasoning Events
    this.socket.on('ai-reasoning-start', (data) => {
      this.log(`🧠 AI Reasoning Start: ${JSON.stringify(data)}`, TEST_PHASES.REASONING_EVENTS);
      this.reasoningEvents.push({ type: 'ai-reasoning-start', data, timestamp: Date.now() });
    });

    this.socket.on('ai-reasoning-chunk', (data) => {
      this.log(`🧠 AI Reasoning Chunk: ${data.reasoning?.substring(0, 100)}...`, TEST_PHASES.REASONING_EVENTS);
      this.reasoningEvents.push({ type: 'ai-reasoning-chunk', data, timestamp: Date.now() });
    });

    this.socket.on('ai-reasoning-end', (data) => {
      this.log(`🧠 AI Reasoning End: ${JSON.stringify(data)}`, TEST_PHASES.REASONING_EVENTS);
      this.reasoningEvents.push({ type: 'ai-reasoning-end', data, timestamp: Date.now() });
    });

    // Content Events
    this.socket.on('ai-content-start', (data) => {
      this.log(`📝 AI Content Start: ${JSON.stringify(data)}`, TEST_PHASES.REASONING_EVENTS);
      this.streamEvents.push({ type: 'ai-content-start', data, timestamp: Date.now() });
    });

    // Error Events
    this.socket.on('ai-error', (data) => {
      this.log(`❌ AI Error: ${JSON.stringify(data)}`, TEST_PHASES.REASONING_EVENTS);
      this.testResults.hasError = true;
    });

    // Other Events
    this.socket.on('room-message-created', (data) => {
      this.log(`💬 Room Message Created: ${JSON.stringify(data)}`, TEST_PHASES.REASONING_EVENTS);
    });

    this.socket.on('user-typing', (data) => {
      this.log(`⌨️ User Typing: ${JSON.stringify(data)}`, TEST_PHASES.REASONING_EVENTS);
    });
  }

  async testReasoningEvents() {
    this.log('🧠 Analyzing reasoning events...', TEST_PHASES.REASONING_EVENTS);
    
    // Wait a bit for any remaining events
    await new Promise(resolve => setTimeout(resolve, 2000));

    this.testResults.reasoningEventsCount = this.reasoningEvents.length;
    this.testResults.streamEventsCount = this.streamEvents.length;

    this.log(`📊 Event Summary:`, TEST_PHASES.REASONING_EVENTS);
    this.log(`   - Reasoning Events: ${this.reasoningEvents.length}`, TEST_PHASES.REASONING_EVENTS);
    this.log(`   - Stream Events: ${this.streamEvents.length}`, TEST_PHASES.REASONING_EVENTS);
  }

  async analyzeResults() {
    this.log('🔍 Analyzing test results...', 'ANALYSIS');

    // Check if reasoning events were received
    const hasReasoningEvents = this.reasoningEvents.length > 0;
    const hasStreamEvents = this.streamEvents.length > 0;

    this.log(`✅ Test Results:`, 'ANALYSIS');
    this.log(`   - Socket Connected: ${this.testResults.socketConnected ? '✅' : '❌'}`, 'ANALYSIS');
    this.log(`   - Room Joined: ${this.testResults.roomJoined ? '✅' : '❌'}`, 'ANALYSIS');
    this.log(`   - Message Submitted: ${this.testResults.messageSubmitted ? '✅' : '❌'}`, 'ANALYSIS');
    this.log(`   - Reasoning Events: ${hasReasoningEvents ? '✅' : '❌'} (${this.reasoningEvents.length})`, 'ANALYSIS');
    this.log(`   - Stream Events: ${hasStreamEvents ? '✅' : '❌'} (${this.streamEvents.length})`, 'ANALYSIS');

    // Detailed reasoning analysis
    if (hasReasoningEvents) {
      this.log(`🧠 Reasoning Event Details:`, 'ANALYSIS');
      this.reasoningEvents.forEach((event, index) => {
        this.log(`   ${index + 1}. ${event.type}: ${JSON.stringify(event.data)}`, 'ANALYSIS');
      });
    } else {
      this.log(`❌ No reasoning events received!`, 'ANALYSIS');
      this.log(`   This indicates the issue is in the backend reasoning extraction`, 'ANALYSIS');
    }

    // Check for <think> tags in stream chunks
    const thinkTagsFound = this.streamEvents.some(event => 
      event.type === 'ai-stream-chunk' && 
      event.data.chunk && 
      event.data.chunk.includes('<think>')
    );

    this.log(`🔍 <think> tags in stream: ${thinkTagsFound ? '✅' : '❌'}`, 'ANALYSIS');

    if (thinkTagsFound) {
      this.log(`   DeepSeek is outputting <think> tags but they're not being extracted`, 'ANALYSIS');
    } else {
      this.log(`   DeepSeek is not outputting <think> tags - check model configuration`, 'ANALYSIS');
    }

    // Generate recommendations
    this.generateRecommendations();
  }

  generateRecommendations() {
    this.log('💡 Recommendations:', 'RECOMMENDATIONS');

    if (this.reasoningEvents.length === 0) {
      this.log(`1. 🔧 Backend Issue: Check aiResponseHandler.ts reasoning extraction`, 'RECOMMENDATIONS');
      this.log(`   - Verify <think> tag regex is working`, 'RECOMMENDATIONS');
      this.log(`   - Check if DeepSeek R1 is actually outputting <think> tags`, 'RECOMMENDATIONS');
      this.log(`   - Verify reasoning events are being emitted correctly`, 'RECOMMENDATIONS');
    }

    if (this.streamEvents.length === 0) {
      this.log(`2. 🔧 Connection Issue: Check Socket.IO event emission`, 'RECOMMENDATIONS');
      this.log(`   - Verify aiResponseHandler is connected to Socket.IO`, 'RECOMMENDATIONS');
      this.log(`   - Check if events are being emitted to the correct room`, 'RECOMMENDATIONS');
    }

    this.log(`3. 🔧 Frontend Issue: Check useRoomSocket.ts event listeners`, 'RECOMMENDATIONS');
    this.log(`   - Verify reasoning event handlers are properly set up`, 'RECOMMENDATIONS');
    this.log(`   - Check if roomReasoningState is being updated`, 'RECOMMENDATIONS');

    this.log(`4. 🔧 Model Issue: Verify DeepSeek R1 configuration`, 'RECOMMENDATIONS');
    this.log(`   - Check if reasoning mode is enabled in model config`, 'RECOMMENDATIONS');
    this.log(`   - Verify OpenRouter is sending reasoning data`, 'RECOMMENDATIONS');
  }

  async cleanup() {
    this.log('🧹 Cleaning up...', 'CLEANUP');
    
    if (this.socket) {
      this.socket.disconnect();
      this.log('✅ Socket disconnected', 'CLEANUP');
    }

    // Save test results to file
    const fs = require('fs');
    const testReport = {
      timestamp: new Date().toISOString(),
      config: TEST_CONFIG,
      results: this.testResults,
      reasoningEvents: this.reasoningEvents,
      streamEvents: this.streamEvents,
      eventLog: this.eventLog
    };

    fs.writeFileSync('deepseek-reasoning-test-report.json', JSON.stringify(testReport, null, 2));
    this.log('📄 Test report saved to deepseek-reasoning-test-report.json', 'CLEANUP');
  }
}

// Run the test
async function main() {
  const tester = new DeepSeekReasoningTester();
  await tester.runTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DeepSeekReasoningTester;
