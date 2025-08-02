// Load test for Socket.IO infrastructure
const { io } = require('socket.io-client');

const CONCURRENT_CONNECTIONS = 10;
const TEST_DURATION = 5000; // 5 seconds

console.log(`Starting Socket.IO load test with ${CONCURRENT_CONNECTIONS} concurrent connections...`);

let connectedCount = 0;
let messagesReceived = 0;
const connections = [];

function createConnection(id) {
  return new Promise((resolve, reject) => {
    const socket = io('http://localhost:3000', {
      auth: { token: `load-test-user-${id}` },
      timeout: 5000
    });

    socket.on('connect', () => {
      connectedCount++;
      console.log(`Connection ${id} established (${connectedCount}/${CONCURRENT_CONNECTIONS})`);
      
      // Join a test room
      socket.emit('join-room', 'load-test-room');
      
      // Send periodic messages
      const messageInterval = setInterval(() => {
        socket.emit('send-message', {
          roomId: 'load-test-room',
          message: `Message from user ${id} at ${Date.now()}`,
          threadId: 'load-test-thread'
        });
      }, 1000);

      // Listen for messages from other users
      socket.on('new-room-message', (data) => {
        messagesReceived++;
      });

      connections.push({ socket, messageInterval });
      resolve(socket);
    });

    socket.on('connect_error', (error) => {
      console.error(`Connection ${id} failed:`, error.message);
      reject(error);
    });
  });
}

async function runLoadTest() {
  try {
    // Create all connections
    const connectionPromises = [];
    for (let i = 1; i <= CONCURRENT_CONNECTIONS; i++) {
      connectionPromises.push(createConnection(i));
    }

    await Promise.all(connectionPromises);
    console.log(`✅ All ${CONCURRENT_CONNECTIONS} connections established`);

    // Run test for specified duration
    await new Promise(resolve => setTimeout(resolve, TEST_DURATION));

    // Cleanup
    connections.forEach(({ socket, messageInterval }) => {
      clearInterval(messageInterval);
      socket.disconnect();
    });

    console.log('\n📊 Load Test Results:');
    console.log(`- Concurrent connections: ${connectedCount}/${CONCURRENT_CONNECTIONS}`);
    console.log(`- Messages received: ${messagesReceived}`);
    console.log(`- Test duration: ${TEST_DURATION}ms`);
    console.log(`- Average messages per second: ${(messagesReceived / (TEST_DURATION / 1000)).toFixed(2)}`);
    
    if (connectedCount === CONCURRENT_CONNECTIONS) {
      console.log('✅ Load test passed!');
      process.exit(0);
    } else {
      console.log('❌ Load test failed - not all connections established');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Load test failed:', error);
    process.exit(1);
  }
}

runLoadTest();