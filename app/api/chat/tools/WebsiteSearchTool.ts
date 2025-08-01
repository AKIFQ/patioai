// app/api/chat/tools/WebsiteSearchTool.ts
import { tool } from 'ai';
import { z } from 'zod';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';

// Zod schema for query variations
const websiteSearchSchema = z.object({
  queryVariation1: z
    .string()
    .min(1)
    .describe(
      'A version that is optimized for searching a broader range of resources for comprehensive information on the topic'
    ),
  queryVariation2: z
    .string()
    .min(1)
    .describe(
      'A variation that focuses on recency and latest developments on the topic. Include temporal aspects and focus on updated information. Output must be in English.'
    ),
  queryVariation3: z
    .string()
    .min(1)
    .describe(
      'A variation that focuses on practical examples and applications. Search for cases, guides, and concrete implementations. Output must be in English.'
    )
});

// Type definitions
interface SearchResultURL {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
}

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
  score: number;
}

interface TavilyAPIResponse {
  answer?: string;
  query: string;
  response_time?: string;
  follow_up_questions?: string[];
  images?: string[];
  results: TavilySearchResult[];
}

// Make sure the structure matches other tools exactly
export const websiteSearchTool = tool({
  description:
    'Search the web for up-to-date information on any topic. This tool is effective for finding comprehensive information, recent developments, and practical implementation guides.',
  parameters: z.object({
    query: z.string().describe('The query to search for on the web')
  }),
  execute: async (args, { messages }) => {
    // Check if API key is configured
    if (!process.env.TAVILY_API_KEY) {
      return {
        systemPrompt: `
          <search_results>
          Web search is currently unavailable because TAVILY_API_KEY is not configured.
          Please add your Tavily API key to the .env.local file or use other available tools.
          </search_results>
          
          <instructions>
          Inform the user that web search is currently unavailable and suggest they:
          1. Configure the TAVILY_API_KEY in their environment
          2. Or try asking questions that don't require real-time web search
          </instructions>
        `
      };
    }

    // Generate improved search queries
    const currentDate = new Date().toISOString().split('T')[0];

    const queryOptimizationPrompt = `
      <metadata>
      <current_date>${currentDate}</current_date>
      </metadata>
      
      As an expert in information retrieval, optimize the user's query into three different variations.
      Use the above date as a reference for recency.
      
      <instructions>
      1. The first variation should be a general and comprehensive search:
         - Broader context and background
         - Different aspects of the topic
         - Key concepts and definitions
      
      2. The second variation should focus on recency (based on ${currentDate}):
         - New developments and updates
         - Recent research or findings
         - Current trends and discussions
      
      3. The third variation should focus on practical implementation:
         - Concrete examples
         - Guides and tutorials
         - Best practices and recommendations
      </instructions>

      <example>
      Original: "What are the rules for digital contracts?"

      Variation 1: "Digital contracts electronic signatures legal framework explanation"
      Variation 2: "Latest regulations ${
        currentDate.split('-')[0]
      } digital contracts e-signing updates"
      Variation 3: "Practical guide implementing digital contracts business examples"
      </example>
      Query: "${args.query}"
      
      `;

    const { object } = await generateObject({
      model: google('gemini-2.0-flash-001'),
      system: queryOptimizationPrompt,
      schema: websiteSearchSchema,
      temperature: 0,
      messages
    });

    const websiteQueries = [
      object.queryVariation1,
      object.queryVariation2,
      object.queryVariation3
    ].filter((query) => query !== undefined && query.trim() !== '');

    // Execute searches for each query variation
    const searchPromises = websiteQueries.map(async (query) => {
      const body = {
        api_key: process.env.TAVILY_API_KEY,
        search_depth: 'advanced',
        include_answer: false,
        include_images: false,
        include_raw_content: true,
        max_results: 2,
        query: query
      };

      try {
        const response = await fetch('https://api.tavily.com/search', {
          cache: 'no-store',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        const data: TavilyAPIResponse = await response.json();

        // Check if results exist and is an array
        if (!data.results || !Array.isArray(data.results)) {
          console.warn('Tavily API returned unexpected response:', data);
          return [];
        }

        // Use the results directly from Tavily
        return data.results.map((result: TavilySearchResult) => ({
          title: result.title,
          url: result.url,
          content: result.content,
          raw_content: result.raw_content
        }));
      } catch (error) {
        console.error('Error in Tavily search:', error);
        return [];
      }
    });

    const searchResultsArray = await Promise.all(searchPromises);

    // Deduplicate search results by URL
    const uniqueSearchResults = searchResultsArray
      .flat()
      .reduce((acc, result) => {
        if (!acc.some((r: SearchResultURL) => r.url === result.url)) {
          acc.push(result);
        }
        return acc;
      }, [] as SearchResultURL[]);

    const searchResults = uniqueSearchResults;

    // If no results found, return helpful message
    if (searchResults.length === 0) {
      return {
        systemPrompt: `
          <search_results>
          No web search results were found for the query: "${args.query}"
          This could be due to API configuration issues or network problems.
          </search_results>
          
          <instructions>
          Inform the user that web search is currently unavailable and provide a helpful response based on your general knowledge, while noting that you cannot access current web information.
          </instructions>
        `
      };
    }

    // Format search results for the AI
    const formattedSearchResults = searchResults
      .map(
        (result) => `
<r>
<title>${result.title}</title>
<url>${result.url}</url>
<content>${result.content}</content>
<raw_content>${result.raw_content}</raw_content>
</r>
`
      )
      .join('\n\n');

    // Check token count and truncate if necessary

    // Create system prompt for AI response
    const systemPromptTemplate = `
      <search_results>
      ${formattedSearchResults}
      </search_results>

      <instructions>
      
      Based on the content from the found websites, provide a concise and accurate answer to the user's question. If the information is not sufficient, ask for more information or clarification.
      
      Follow these guidelines when responding:
      
      1. Integrate sources directly into your answer as inline references using Markdown link formatting:
        Example: According to [Page Title](URL), it is described that...
      
      2. When referring to specific content or sections from the websites, always include them as inline links:
        As described in [Relevant Section or Heading](URL), the following applies...
      
      3. Make sure to link to all relevant sources you reference as a natural part of the text. This makes it easy for the reader to verify the information.
      
      4. If you're referring to specific content on a page but only have an overall link, you should:
        - Link to the main page: [Page Title](URL)
        - Mention the specific section or information in the text
        Example: On [Website Name](URL) under the section "Specific Section" it states that...
      
      5. Your answer should be:
        - Accurate and concise
        - Contain all relevant details
        - Have sources naturally integrated into the text
        - Be easy to read and understand
      
      6. Avoid grouping references at the end of your answer. They should be a natural part of the text so the reader can easily follow the sources along the way.
      
      7. If the information comes from several different pages, weave them together into a coherent answer where the sources complement each other.
      
      Remember:
      - Be objective and factual in your presentation
      - Ensure all claims are supported by sources
      - Write in clear and professional language
      - Maintain the same high standard for citations as in academic writing
      </instructions>
      `;

    // Return results in consistent format with other tools
    return {
      systemPrompt: systemPromptTemplate
    };
  }
});
