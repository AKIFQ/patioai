#!/usr/bin/env node

/**
 * Direct OpenRouter API Test for DeepSeek R1
 * 
 * This script directly tests the OpenRouter API to see what DeepSeek R1 outputs
 * and whether it includes reasoning content.
 */

const https = require('https');

// Configuration
const TEST_CONFIG = {
  modelId: 'deepseek/deepseek-r1',
  testMessage: 'Explain quantum computing in simple terms',
  maxTokens: 1000,
  temperature: 0.7
};

class OpenRouterDeepSeekTester {
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
    this.log('🚀 Starting OpenRouter DeepSeek R1 Direct Test', 'START');
    this.log(`Test Config: ${JSON.stringify(TEST_CONFIG, null, 2)}`, 'CONFIG');

    if (!this.apiKey) {
      this.log('❌ OPENROUTER_API_KEY environment variable not set', 'ERROR');
      process.exit(1);
    }

    try {
      await this.testOpenRouterAPI();
      await this.analyzeResponse();
      await this.generateRecommendations();
    } catch (error) {
      this.log(`❌ Test failed: ${error.message}`, 'ERROR');
      console.error(error);
    }
  }

  async testOpenRouterAPI() {
    this.log('🔌 Testing OpenRouter API directly...', 'API_TEST');

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

    this.log(`📤 Sending request to OpenRouter...`, 'API_TEST');
    this.log(`Request: ${JSON.stringify(requestBody, null, 2)}`, 'API_TEST');

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

        this.log('✅ OpenRouter API request successful, processing stream...', 'API_TEST');

        let buffer = '';
        
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                this.log('📡 Stream completed', 'API_TEST');
                resolve();
                return;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                  const delta = parsed.choices[0].delta;
                  
                  if (delta.content) {
                    this.testResults.chunks.push(delta.content);
                    this.testResults.rawResponse += delta.content;
                    
                    // Log first few chunks for debugging
                    if (this.testResults.chunks.length <= 5) {
                      this.log(`📡 Chunk ${this.testResults.chunks.length}: "${delta.content}"`, 'API_TEST');
                    }
                  }
                }
              } catch (parseError) {
                this.log(`⚠️ Failed to parse chunk: ${data}`, 'API_TEST');
              }
            }
          }
        });

        res.on('end', () => {
          this.log(`✅ Stream processing complete. Total chunks: ${this.testResults.chunks.length}`, 'API_TEST');
          resolve();
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  async analyzeResponse() {
    this.log('🔍 Analyzing response...', 'ANALYSIS');

    const fullResponse = this.testResults.rawResponse;
    
    // Check for <think> tags
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    const thinkMatches = [...fullResponse.matchAll(thinkRegex)];
    
    this.testResults.hasThinkTags = thinkMatches.length > 0;
    this.testResults.thinkContent = thinkMatches.map(match => match[1]).join('\n');
    
    // Remove <think> tags to get final content
    this.testResults.finalContent = fullResponse.replace(thinkRegex, '').trim();

    // Check for other reasoning indicators
    const reasoningIndicators = [
      '**Reasoning:**',
      '**Thinking:**',
      '**Analysis:**',
      'Let me think',
      'I need to',
      'First, I should',
      'To answer this'
    ];

    this.testResults.reasoningDetected = reasoningIndicators.some(indicator => 
      fullResponse.includes(indicator)
    );

    // Log analysis results
    this.log(`📊 Analysis Results:`, 'ANALYSIS');
    this.log(`   - Total response length: ${fullResponse.length} characters`, 'ANALYSIS');
    this.log(`   - Has <think> tags: ${this.testResults.hasThinkTags ? '✅' : '❌'}`, 'ANALYSIS');
    this.log(`   - Number of <think> blocks: ${thinkMatches.length}`, 'ANALYSIS');
    this.log(`   - Reasoning indicators found: ${this.testResults.reasoningDetected ? '✅' : '❌'}`, 'ANALYSIS');
    this.log(`   - Final content length: ${this.testResults.finalContent.length} characters`, 'ANALYSIS');

    if (this.testResults.hasThinkTags) {
      this.log(`🧠 <think> Content Found:`, 'ANALYSIS');
      this.log(`"${this.testResults.thinkContent.substring(0, 200)}..."`, 'ANALYSIS');
    }

    if (this.testResults.finalContent) {
      this.log(`📝 Final Content (first 200 chars):`, 'ANALYSIS');
      this.log(`"${this.testResults.finalContent.substring(0, 200)}..."`, 'ANALYSIS');
    }

    // Check if response looks like reasoning
    const hasReasoningStructure = this.testResults.thinkContent.length > 50 || 
                                 this.testResults.reasoningDetected;

    this.log(`🧠 Reasoning Structure Detected: ${hasReasoningStructure ? '✅' : '❌'}`, 'ANALYSIS');
  }

  async generateRecommendations() {
    this.log('💡 Recommendations:', 'RECOMMENDATIONS');

    if (!this.testResults.hasThinkTags) {
      this.log(`1. 🔧 DeepSeek R1 is NOT outputting <think> tags`, 'RECOMMENDATIONS');
      this.log(`   - Check if reasoning mode is enabled in OpenRouter`, 'RECOMMENDATIONS');
      this.log(`   - Verify DeepSeek R1 model configuration`, 'RECOMMENDATIONS');
      this.log(`   - Try different prompts that might trigger reasoning`, 'RECOMMENDATIONS');
    } else {
      this.log(`1. ✅ DeepSeek R1 IS outputting <think> tags`, 'RECOMMENDATIONS');
      this.log(`   - Backend should be able to extract reasoning`, 'RECOMMENDATIONS');
      this.log(`   - Check aiResponseHandler.ts <think> extraction logic`, 'RECOMMENDATIONS');
    }

    if (this.testResults.reasoningDetected) {
      this.log(`2. ✅ Reasoning indicators found in response`, 'RECOMMENDATIONS');
      this.log(`   - Model is doing reasoning, just not in <think> format`, 'RECOMMENDATIONS');
      this.log(`   - Consider extracting reasoning from content patterns`, 'RECOMMENDATIONS');
    }

    this.log(`3. 🔧 Backend Integration Check:`, 'RECOMMENDATIONS');
    this.log(`   - Verify aiResponseHandler.ts handles <think> tags correctly`, 'RECOMMENDATIONS');
    this.log(`   - Check if reasoning events are emitted to Socket.IO`, 'RECOMMENDATIONS');
    this.log(`   - Ensure frontend receives reasoning events`, 'RECOMMENDATIONS');

    this.log(`4. 🔧 Alternative Approaches:`, 'RECOMMENDATIONS');
    this.log(`   - Try different DeepSeek R1 prompts that trigger reasoning`, 'RECOMMENDATIONS');
    this.log(`   - Check if other models (Claude, GPT-4) output reasoning`, 'RECOMMENDATIONS');
    this.log(`   - Consider implementing reasoning detection from content patterns`, 'RECOMMENDATIONS');
  }

  async saveResults() {
    const fs = require('fs');
    const testReport = {
      timestamp: new Date().toISOString(),
      config: TEST_CONFIG,
      results: this.testResults,
      analysis: {
        hasThinkTags: this.testResults.hasThinkTags,
        thinkContentLength: this.testResults.thinkContent.length,
        finalContentLength: this.testResults.finalContent.length,
        totalChunks: this.testResults.chunks.length,
        reasoningDetected: this.testResults.reasoningDetected
      }
    };

    fs.writeFileSync('openrouter-deepseek-test-report.json', JSON.stringify(testReport, null, 2));
    this.log('📄 Test report saved to openrouter-deepseek-test-report.json', 'SAVE');
  }
}

// Run the test
async function main() {
  const tester = new OpenRouterDeepSeekTester();
  await tester.runTest();
  await tester.saveResults();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = OpenRouterDeepSeekTester;
