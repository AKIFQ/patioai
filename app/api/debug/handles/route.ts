import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const activeHandles = process._getActiveHandles?.() || [];
    const activeRequests = process._getActiveRequests?.() || [];
    
    // Analyze handle types
    const handleTypes = new Map<string, number>();
    const handleDetails: any[] = [];
    
    activeHandles.forEach((handle, index) => {
      const type = handle.constructor?.name || 'Unknown';
      handleTypes.set(type, (handleTypes.get(type) || 0) + 1);
      
      // Get more details about the handle
      const details: any = {
        index,
        type,
        readable: handle.readable,
        writable: handle.writable,
        destroyed: handle.destroyed,
        pending: handle.pending
      };
      
      // Add specific details for different handle types
      if (handle.remoteAddress) {
        details.remoteAddress = handle.remoteAddress;
        details.remotePort = handle.remotePort;
      }
      
      if (handle.localAddress) {
        details.localAddress = handle.localAddress;
        details.localPort = handle.localPort;
      }
      
      if (handle.url) {
        details.url = handle.url;
      }
      
      if (handle.path) {
        details.path = handle.path;
      }
      
      handleDetails.push(details);
    });
    
    // Analyze request types
    const requestTypes = new Map<string, number>();
    const requestDetails: any[] = [];
    
    activeRequests.forEach((request, index) => {
      const type = request.constructor?.name || 'Unknown';
      requestTypes.set(type, (requestTypes.get(type) || 0) + 1);
      
      requestDetails.push({
        index,
        type,
        method: request.method,
        url: request.url,
        path: request.path,
        host: request.host
      });
    });
    
    return NextResponse.json({
      summary: {
        totalHandles: activeHandles.length,
        totalRequests: activeRequests.length,
        handleTypes: Object.fromEntries(handleTypes),
        requestTypes: Object.fromEntries(requestTypes)
      },
      handles: handleDetails.slice(0, 20), // Limit to first 20 for readability
      requests: requestDetails.slice(0, 10), // Limit to first 10
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
      },
      process: {
        uptime: Math.round(process.uptime()),
        pid: process.pid
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Handle debug error:', error);
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}