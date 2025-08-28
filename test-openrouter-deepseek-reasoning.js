#!/usr/bin/env node

/**
 * DeepSeek R1 Reasoning Mode Test
 * 
 * This script tests DeepSeek R1 with reasoning mode enabled to see if it outputs <think> tags.
 */

const https = require('https');

// Configuration
const TEST_CONFIG = {
  modelId: 'deepseek/deepseek-r1',
  testMessage: 'Explain quantum computing in simple terms',
  maxTokens: 1000,
  temperature: 0.7
};

class DeepSeekReasoningTester {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseUrl = 'openrouter.ai';
    this.testResults = {
      rawResponse: '',
      chunks: [],
      hasThinkTags: false,
      thinkContent: '',
      finalContent: '',
      reasoningDetected: false
    };
  }

  log(message, phase = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${phase}] ${message}`);
  }

  async runTest() {
    this.log('🚀 Starting DeepSeek R1 Reasoning Mode Test', 'START');
    this.log(`Test Config: ${JSON.stringify(TEST_CONFIG, null, 2)}`, 'CONFIG');

    if (!this.apiKey) {
      this.log('❌ OPENROUTER_API_KEY environment variable not set', 'ERROR');
      process.exit(1);
    }

    try {
      await this.testWithoutReasoning();
      await this.testWithReasoning();
      await this.analyzeResults();
    } catch (error) {
      this.log(`❌ Test failed: ${error.message}`, 'ERROR');
      console.error(error);
    }
  }

  async testWithoutReasoning() {
    this.log('🔌 Testing DeepSeek R1 WITHOUT reasoning mode...', 'TEST_NO_REASONING');
    
    const requestBody = {
      model: TEST_CONFIG.modelId,
      messages: [
        {
          role: 'user',
          content: TEST_CONFIG.testMessage
        }
      ],
      max_tokens: TEST_CONFIG.maxTokens,
      temperature: TEST_CONFIG.temperature,
      stream: true
    };

    const response = await this.makeRequest(requestBody);
    this.testResults.withoutReasoning = response;
    
    this.log(`✅ Test without reasoning completed. Response length: ${response.length}`, 'TEST_NO_REASONING');
  }

  async testWithReasoning() {
    this.log('🔌 Testing DeepSeek R1 WITH reasoning mode...', 'TEST_WITH_REASONING');
    
    const requestBody = {
      model: TEST_CONFIG.modelId,
      messages: [
        {
          role: 'user',
          content: TEST_CONFIG.testMessage
        }
      ],
      max_tokens: TEST_CONFIG.maxTokens,
      temperature: TEST_CONFIG.temperature,
      stream: true,
      // Enable reasoning mode
      reasoning: {
        enabled: true,
        effort: 'high'
      }
    };

    const response = await this.makeRequest(requestBody);
    this.testResults.withReasoning = response;
    
    this.log(`✅ Test with reasoning completed. Response length: ${response.length}`, 'TEST_WITH_REASONING');
  }

  async makeRequest(requestBody) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(requestBody);
      
      const options = {
        hostname: this.baseUrl,
        port: 443,
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'PatioAI Test',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          let errorData = '';
          res.on('data', (chunk) => {
            errorData += chunk;
          });
          res.on('end', () => {
            reject(new Error(`OpenRouter API error: ${res.statusCode} ${errorData}`));
          });
          return;
        }

        let buffer = '';
        let fullResponse = '';
        
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                resolve(fullResponse);
                return;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                  const delta = parsed.choices[0].delta;
                  
                  if (delta.content) {
                    fullResponse += delta.content;
                  }
                }
              } catch (parseError) {
                // Ignore parse errors for non-JSON lines
              }
            }
          }
        });

        res.on('end', () => {
          resolve(fullResponse);
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  async analyzeResults() {
    this.log('🔍 Analyzing test results...', 'ANALYSIS');

    const withoutReasoning = this.testResults.withoutReasoning;
    const withReasoning = this.testResults.withReasoning;

    // Check for <think> tags in both responses
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    
    const withoutThinkMatches = [...withoutReasoning.matchAll(thinkRegex)];
    const withThinkMatches = [...withReasoning.matchAll(thinkRegex)];

    const withoutThinkContent = withoutThinkMatches.map(match => match[1]).join('\n');
    const withThinkContent = withThinkMatches.map(match => match[1]).join('\n');

    // Log analysis results
    this.log(`📊 Analysis Results:`, 'ANALYSIS');
    this.log(`   - Without reasoning: ${withoutReasoning.length} chars, ${withoutThinkMatches.length} <think> blocks`, 'ANALYSIS');
    this.log(`   - With reasoning: ${withReasoning.length} chars, ${withThinkMatches.length} <think> blocks`, 'ANALYSIS');

    if (withoutThinkMatches.length > 0) {
      this.log(`🧠 <think> tags found WITHOUT reasoning mode:`, 'ANALYSIS');
      this.log(`"${withoutThinkContent.substring(0, 200)}..."`, 'ANALYSIS');
    }

    if (withThinkMatches.length > 0) {
      this.log(`🧠 <think> tags found WITH reasoning mode:`, 'ANALYSIS');
      this.log(`"${withThinkContent.substring(0, 200)}..."`, 'ANALYSIS');
    }

    // Check for reasoning indicators
    const reasoningIndicators = [
      '**Reasoning:**',
      '**Thinking:**',
      '**Analysis:**',
      'Let me think',
      'I need to',
      'First, I should',
      'To answer this'
    ];

    const withoutReasoningIndicators = reasoningIndicators.filter(indicator => 
      withoutReasoning.includes(indicator)
    );
    const withReasoningIndicators = reasoningIndicators.filter(indicator => 
      withReasoning.includes(indicator)
    );

    this.log(`   - Without reasoning indicators: ${withoutReasoningIndicators.length}`, 'ANALYSIS');
    this.log(`   - With reasoning indicators: ${withReasoningIndicators.length}`, 'ANALYSIS');

    // Generate conclusions
    this.log('💡 Conclusions:', 'CONCLUSIONS');
    
    if (withThinkMatches.length > withoutThinkMatches.length) {
      this.log(`✅ Reasoning mode DOES enable <think> tags in DeepSeek R1`, 'CONCLUSIONS');
      this.log(`   - Without reasoning: ${withoutThinkMatches.length} <think> blocks`, 'CONCLUSIONS');
      this.log(`   - With reasoning: ${withThinkMatches.length} <think> blocks`, 'CONCLUSIONS');
    } else if (withThinkMatches.length === withoutThinkMatches.length && withThinkMatches.length > 0) {
      this.log(`⚠️ DeepSeek R1 outputs <think> tags regardless of reasoning mode`, 'CONCLUSIONS');
    } else {
      this.log(`❌ DeepSeek R1 does NOT output <think> tags even with reasoning mode`, 'CONCLUSIONS');
    }

    if (withReasoningIndicators.length > withoutReasoningIndicators.length) {
      this.log(`✅ Reasoning mode DOES affect response structure`, 'CONCLUSIONS');
    } else {
      this.log(`⚠️ Reasoning mode does NOT significantly affect response structure`, 'CONCLUSIONS');
    }
  }
}

// Run the test
async function main() {
  const tester = new DeepSeekReasoningTester();
  await tester.runTest();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DeepSeekReasoningTester;
