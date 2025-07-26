// lib/types/toolTypes.ts
import type { ToolCallUnion, ToolResultUnion } from 'ai';
import { searchUserDocument } from '@/app/api/chat/tools/documentChat';
import { websiteSearchTool } from '@/app/api/chat/tools/WebsiteSearchTool';

// Define the toolset with just the document search tool
// Note: userId should be passed dynamically from the actual user session
export const toolSet = {
  searchUserDocument: searchUserDocument({
    userId: '', // This should be populated with the actual user ID
    selectedBlobs: []
  }),
  websiteSearchTool: websiteSearchTool
};

// Generate tool call and result types
export type ToolCall = ToolCallUnion<typeof toolSet>;
export type ToolResult = ToolResultUnion<typeof toolSet>;

// Helper types for document search tool
export type SearchDocumentsCall = Extract<
  ToolCall,
  { toolName: 'searchUserDocument' }
>;
export type SearchDocumentsArgs = SearchDocumentsCall['args'];
export type SearchDocumentsResult = Extract<
  ToolResult,
  { toolName: 'searchUserDocument' }
>['result'];

// Helper types for website search tool
export type WebsiteSearchCall = Extract<
  ToolCall,
  { toolName: 'websiteSearchTool' }
>;
export type WebsiteSearchArgs = WebsiteSearchCall['args'];
export type WebsiteSearchResult = Extract<
  ToolResult,
  { toolName: 'websiteSearchTool' }
>['result'];
