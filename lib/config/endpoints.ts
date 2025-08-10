interface EndpointConfig {
  socketIO: {
    serverUrl: string;
    clientUrl: string;
    timeout: number;
    retries: number;
    reconnectionAttempts: number;
    reconnectionDelay: number;
  };
  api: {
    baseUrl: string;
    chatEndpoint: string;
    roomEndpoint: string;
    uploadEndpoint: string;
    cleanupEndpoint: string;
  };
  external: {
    llamaCloudUrl: string;
    tavilySearchUrl: string;
    metadataServiceUrl: string;
  };
}

export const getConfig = (): EndpointConfig => ({
  socketIO: {
    serverUrl: process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000',
    clientUrl: process.env.NEXT_PUBLIC_CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000',
    timeout: parseInt(process.env.SOCKET_TIMEOUT || '20000'),
    retries: parseInt(process.env.SOCKET_RETRIES || '3'),
    reconnectionAttempts: parseInt(process.env.SOCKET_RECONNECTION_ATTEMPTS || '5'),
    reconnectionDelay: parseInt(process.env.SOCKET_RECONNECTION_DELAY || '1000'),
  },
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/api` : '/api'),
    chatEndpoint: process.env.NEXT_PUBLIC_CHAT_ENDPOINT || '/api/chat',
    roomEndpoint: process.env.NEXT_PUBLIC_ROOM_ENDPOINT || '/api/rooms',
    uploadEndpoint: process.env.NEXT_PUBLIC_UPLOAD_ENDPOINT || '/api/upload',
    cleanupEndpoint: process.env.NEXT_PUBLIC_CLEANUP_ENDPOINT || '/api/cleanup',
  },
  external: {
    llamaCloudUrl: process.env.LLAMA_CLOUD_API_URL || 'https://api.cloud.llamaindex.ai',
    tavilySearchUrl: process.env.TAVILY_API_URL || 'https://api.tavily.com',
    metadataServiceUrl: process.env.METADATA_SERVICE_URL || '/api/metadata',
  },
});

export const config = getConfig();