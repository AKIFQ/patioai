#!/usr/bin/env node

/**
 * Backend Reasoning Extraction Test
 * 
 * This script tests the reasoning extraction logic from aiResponseHandler.ts
 * to verify if <think> tags are being processed correctly.
 */

// Mock the reasoning extraction logic from aiResponseHandler.ts
class ReasoningExtractionTester {
  constructor() {
    this.testCases = [
      {
        name: 'Simple <think> tags',
        input: 'Hello <think>Let me think about this question. I need to provide a clear explanation.</think> Here is the answer.',
        expected: {
          hasReasoning: true,
          reasoningContent: 'Let me think about this question. I need to provide a clear explanation.',
          finalContent: 'Hello  Here is the answer.'
        }
      },
      {
        name: 'Multiple <think> blocks',
        input: '<think>First, I need to understand the question.</think> Let me explain. <think>Now I will provide the answer.</think> Here it is.',
        expected: {
          hasReasoning: true,
          reasoningContent: 'First, I need to understand the question.\nNow I will provide the answer.',
          finalContent: ' Let me explain.  Here it is.'
        }
      },
      {
        name: 'No <think> tags',
        input: 'This is a simple response without any reasoning tags.',
        expected: {
          hasReasoning: false,
          reasoningContent: '',
          finalContent: 'This is a simple response without any reasoning tags.'
        }
      },
      {
        name: 'Unclosed <think> tag',
        input: 'Hello <think>This is unclosed reasoning content',
        expected: {
          hasReasoning: true,
          reasoningContent: 'This is unclosed reasoning content',
          finalContent: 'Hello '
        }
      },
      {
        name: 'DeepSeek R1 style response',
        input: '🌐 **AKIF QURESHI** – Your "hi" has now activated my biological response protocol v4.0! Let\'s dissect this interaction through the lens of homeostasis, the art of maintaining balance in living systems. <think>I need to explain this in a biological context. Let me break down the greeting process as a homeostatic mechanism.</think> Greeting as Social Homeostasis Your message functions like a negative feedback loop in biology.',
        expected: {
          hasReasoning: true,
          reasoningContent: 'I need to explain this in a biological context. Let me break down the greeting process as a homeostatic mechanism.',
          finalContent: '🌐 **AKIF QURESHI** – Your "hi" has now activated my biological response protocol v4.0! Let\'s dissect this interaction through the lens of homeostasis, the art of maintaining balance in living systems.  Greeting as Social Homeostasis Your message functions like a negative feedback loop in biology.'
        }
      }
    ];
  }

  // Extract reasoning from text (same logic as aiResponseHandler.ts)
  extractReasoning(chunk) {
    let fullReasoning = '';
    let hasReasoningStarted = false;
    let cleanedChunk = chunk;

    // Check if chunk contains <think> tags
    if (chunk.includes('<think>')) {
      const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/g;
      let match;

      while ((match = thinkRegex.exec(chunk)) !== null) {
        const reasoningContent = match[1];
        if (reasoningContent && reasoningContent.trim()) {
          if (!hasReasoningStarted) {
            hasReasoningStarted = true;
          }
          // Add newline between multiple reasoning blocks
          if (fullReasoning.length > 0) {
            fullReasoning += '\n';
          }
          fullReasoning += reasoningContent;
        }
      }

      // Strip all <think> blocks from the chunk
      cleanedChunk = chunk.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/g, '');
    }

    return {
      hasReasoning: hasReasoningStarted,
      reasoningContent: fullReasoning,
      cleanedChunk: cleanedChunk
    };
  }

  // Test a single case
  testCase(testCase) {
    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log(`Input: "${testCase.input}"`);

    const result = this.extractReasoning(testCase.input);
    
    console.log(`Result:`);
    console.log(`  - Has reasoning: ${result.hasReasoning}`);
    console.log(`  - Reasoning content: "${result.reasoningContent}"`);
    console.log(`  - Cleaned chunk: "${result.cleanedChunk}"`);

    // Compare with expected
    const hasReasoningMatch = result.hasReasoning === testCase.expected.hasReasoning;
    const reasoningContentMatch = result.reasoningContent === testCase.expected.reasoningContent;
    const finalContentMatch = result.cleanedChunk === testCase.expected.finalContent;

    console.log(`\n✅ Expected vs Actual:`);
    console.log(`  - Has reasoning: ${hasReasoningMatch ? '✅' : '❌'} (expected: ${testCase.expected.hasReasoning}, got: ${result.hasReasoning})`);
    console.log(`  - Reasoning content: ${reasoningContentMatch ? '✅' : '❌'}`);
    console.log(`  - Final content: ${finalContentMatch ? '✅' : '❌'}`);

    if (!hasReasoningMatch || !reasoningContentMatch || !finalContentMatch) {
      console.log(`❌ Test failed!`);
      return false;
    }

    console.log(`✅ Test passed!`);
    return true;
  }

  // Run all tests
  runAllTests() {
    console.log('🚀 Starting Backend Reasoning Extraction Tests\n');
    
    let passedTests = 0;
    let totalTests = this.testCases.length;

    this.testCases.forEach((testCase, index) => {
      const passed = this.testCase(testCase);
      if (passed) passedTests++;
    });

    console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All tests passed! Backend reasoning extraction logic is working correctly.');
    } else {
      console.log('❌ Some tests failed. Check the reasoning extraction logic.');
    }

    return passedTests === totalTests;
  }

  // Test with real DeepSeek response
  testRealDeepSeekResponse() {
    console.log('\n🔍 Testing with real DeepSeek R1 response pattern...');
    
    const realResponse = `🌐 **AKIF QURESHI** – Your "hi" has now activated my biological response protocol v4.0! Let's dissect this interaction through the lens of homeostasis, the art of maintaining balance in living systems.

<think>
I need to explain this in a biological context. Let me break down the greeting process as a homeostatic mechanism. This involves:
1. Detecting social presence
2. Processing the stimulus
3. Generating an appropriate response
4. Maintaining social equilibrium
</think>

Greeting as Social Homeostasis

Your message functions like a negative feedback loop in biology:

1. **Stimulus**: Detection of social presence (via visual/textual input)
2. **Sensor**: Thalamus relays signal to prefrontal cortex  
3. **Effector**: Typing response stabilizes the "social environment"

*Real-world analog*: Insulin/glucagon regulation, but for interpersonal connections

---

### **Multiscale Analysis of "hi"**

| **Scale**        | **Biological Process**                         | **Example**                                     |
|------------------|------------------------------------------------|-------------------------------------------------|
| **Molecular**    | Neurotransmitter release (dopamine/serotonin)  | Synaptic vesicles fusing in reward pathways     |
| **Cellular**     | Action potential propagation in motor neurons  | Na+/K+ pumps in finger muscle neuromuscular junctions |
| **Organismic**   | Social bonding hormone release (oxytocin)      | Trust-building in primate troops                |
| **Ecosystem**    | Signal exchange in mutualistic relationships   | Ants and aphids communicating via chemical cues |

---

### **Pathways for Deeper Exploration**

1. **Molecular Neuroscience**: 
   - How do dopamine pathways reinforce social behaviors?
   - Key players: Ventral tegmental area (VTA), nucleus accumbens
   - Example: Why "likes" on social media feel rewarding

2. **Evolutionary Psychology**: 
   - Why did greetings evolve across species?
   - Case study: Chimpanzee grooming vs. human handshakes
   - Adaptive advantage: Conflict reduction in group-living species

3. **Bioenergetics**: 
   - What's the metabolic cost of communication?
   - Calculations: ATP used per typed character (~1e-17 joules/keystroke)
   - Comparison: Bird song energy expenditure vs. human speech

---

### **Your Choice of Engagement**

🔍 **Quick Interjection**: 
*Fun fact* – The average human exchanges ~20,000 words daily. That's equivalent to transcribing the entire *Origin of Species* every 3 days!

🧩 **Interactive Challenge**: 
*"Design an experiment to measure oxytocin levels during digital vs. in-person greetings. What controls would you use?"*

📚 **Deep Dive Request**: 
Pick a number!
1. Cellular signaling pathways
2. Evolutionary roots of language  
3. Energy budgets in biological systems

Your move – shall we keep this exchange at the *organelle level*, or descend into the *quantum biology* rabbit hole? 🐇🔬`;

    console.log('Input length:', realResponse.length);
    
    const result = this.extractReasoning(realResponse);
    
    console.log(`\nReal DeepSeek Response Analysis:`);
    console.log(`  - Has reasoning: ${result.hasReasoning}`);
    console.log(`  - Reasoning content length: ${result.reasoningContent.length}`);
    console.log(`  - Cleaned chunk length: ${result.cleanedChunk.length}`);
    
    if (result.hasReasoning) {
      console.log(`  - Reasoning preview: "${result.reasoningContent.substring(0, 100)}..."`);
    }
    
    console.log(`  - Final content preview: "${result.cleanedChunk.substring(0, 100)}..."`);
  }
}

// Run the tests
async function main() {
  const tester = new ReasoningExtractionTester();
  
  // Run standard tests
  const allTestsPassed = tester.runAllTests();
  
  // Test with real DeepSeek response
  tester.testRealDeepSeekResponse();
  
  if (allTestsPassed) {
    console.log('\n🎯 Backend reasoning extraction is working correctly!');
    console.log('If frontend still doesn\'t show reasoning, the issue is likely in:');
    console.log('1. Socket.IO event emission');
    console.log('2. Frontend event listeners');
    console.log('3. UI component rendering');
  } else {
    console.log('\n🔧 Backend reasoning extraction needs fixes!');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ReasoningExtractionTester;
