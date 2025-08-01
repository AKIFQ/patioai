import { NextResponse } from 'next/server';

// Dummy endpoint for room chats to prevent useChat from making real API calls
export async function POST() {
  return NextResponse.json({ 
    message: 'Dummy endpoint - room chats use direct API calls' 
  }, { status: 200 });
}