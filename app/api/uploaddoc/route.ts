import { type NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server/supabase';
import { createAdminClient } from '@/lib/server/admin';
import { userTierService } from '@/lib/ai/userTierService';
import { tierRateLimiter } from '@/lib/limits/rateLimiter';
import { getTierLimits, type UserTier } from '@/lib/limits/tierLimits';
import { memoryProtection } from '@/lib/monitoring/memoryProtection';
import { MessageGenerator } from '@/lib/notifications/messageGenerator';

export const dynamic = 'force-dynamic';

export const maxDuration = 60;

const supabaseAdmin = createAdminClient();

export async function POST(req: NextRequest) {
  try {
    // Check memory protection circuit breaker FIRST
    if (memoryProtection.shouldBlockOperation()) {
      const notification = MessageGenerator.systemEmergencyMode('uploads_disabled');
      
      return NextResponse.json(
        {
          ...notification,
          type: 'system_overload'
        },
        { status: 503 }
      );
    }

    // Check for Llama Cloud API key
    if (!process.env.LLAMA_CLOUD_API_KEY) {
      console.error('LLAMA_CLOUD_API_KEY is not configured');
      const notification = MessageGenerator.genericError('Document processing is temporarily unavailable. Our team is working on it!');
      
      return NextResponse.json(
        notification,
        { status: 500 }
      );
    }

    const session = await getSession();
    if (!session) {
      const notification = MessageGenerator.systemEmergencyMode('ai_disabled'); // Reuse login prompt message
      notification.title = "Sign in required! 🔐";
      notification.message = "You need to be signed in to upload documents. It's quick and free!";
      
      return NextResponse.json(
        {
          ...notification,
          type: 'authentication_required'
        },
        { status: 401 }
      );
    }

    const userId = session.id;

    // Get user tier and check file upload rate limits
    const userSubscription = await userTierService.getUserTier(userId);
    const userTier = userSubscription.tier as UserTier;
    const limiterCheck = await tierRateLimiter.check(userId, userTier, 'file_uploads');
    
    if (!limiterCheck.allowed) {
      const notification = MessageGenerator.fileUploadLimitExceeded(userTier);
      
      return NextResponse.json(
        {
          ...notification,
          remaining: limiterCheck.remaining,
          type: 'rate_limit_exceeded'
        },
        { status: 429 }
      );
    }

    // Get tier limits for file size validation
    const tierLimits = getTierLimits(userTier);

    const { uploadedFiles } = await req.json();

    if (!Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
      const notification = MessageGenerator.genericError('Oops, no files to upload! Please select some files first.');
      
      return NextResponse.json(
        notification, 
        { status: 400 }
      );
    }

    const results = [];

    for (const file of uploadedFiles) {
      try {
        const { data, error } = await supabaseAdmin.storage
          .from('userfiles')
          .download(file.path);

        if (error) {
          console.error('Error downloading file:', error);
          results.push({
            file: file.name,
            status: 'error',
            message: 'Download failed'
          });
          continue;
        }

        // Check file size against tier limit
        const fileSizeMB = data.size / (1024 * 1024);
        if (fileSizeMB > tierLimits.fileSizeMB!) {
          const notification = MessageGenerator.genericError(
            `${file.name} is too large (${fileSizeMB.toFixed(1)}MB). ${userTier} users can upload up to ${tierLimits.fileSizeMB}MB files.${userTier !== 'premium' ? ' Upgrade for larger files!' : ''}`
          );
          
          results.push({
            file: file.name,
            status: 'error',
            message: notification.message,
            upgradeRequired: userTier !== 'premium'
          });
          continue;
        }

        const formData = new FormData();
        formData.append('file', new Blob([data]), file.name);

        const uploadResponse = await fetch(
          'https://api.cloud.llamaindex.ai/api/v1/parsing/upload',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.LLAMA_CLOUD_API_KEY}`,
              Accept: 'application/json'
            },
            body: formData
          }
        );

        if (!uploadResponse.ok) {
          throw new Error(
            `Failed to upload file: ${uploadResponse.statusText}`
          );
        }

        const uploadResult = await uploadResponse.json();
        results.push({
          file: file.name,
          status: 'success',
          jobId: uploadResult.id
        });
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        results.push({
          file: file.name,
          status: 'error',
          message: 'Processing failed'
        });
      }
    }

    // Increment file upload counter for each successful upload
    const successfulUploads = results.filter(r => r.status === 'success').length;
    if (successfulUploads > 0) {
      try {
        await tierRateLimiter.increment(userId, userTier, 'file_uploads', successfulUploads);
      } catch (error) {
        console.warn('Failed to increment file upload counter:', error);
      }
    }

    // Emit Socket.IO events for successful document uploads
    try {
      const { emitSidebarRefresh, getSocketIOInstance } = await import('@/lib/server/socketEmitter');
      const io = getSocketIOInstance();
      
      if (io && results.some(r => r.success)) {
        // Emit document upload events for successful uploads
        results.forEach(result => {
          if (result.success) {
            io.to(`user:${session.id}`).emit('document-uploaded', {
              new: {
                id: result.documentId,
                user_id: session.id,
                title: result.title,
                total_pages: result.totalPages || 1,
                filter_tags: result.title,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              },
              eventType: 'INSERT',
              table: 'user_documents',
              schema: 'public'
            });
          }
        });
        
        // Trigger sidebar refresh
        emitSidebarRefresh(session.id);
      }
    } catch (socketError) {
      console.warn('Failed to emit Socket.IO events for document upload:', socketError);
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Error in POST request:', error);
    const notification = MessageGenerator.genericError('Upload failed! Our document wizards are investigating the issue.');
    
    return NextResponse.json(
      notification,
      { status: 500 }
    );
  }
}
