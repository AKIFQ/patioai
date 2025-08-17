import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { MemoryManager } from '@/lib/monitoring/memoryManager';

export async function GET(request: NextRequest) {
    try {
        const memoryManager = MemoryManager.getInstance();
        const report = memoryManager.getMemoryReport();

        return NextResponse.json({
            success: true,
            data: report,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Memory monitoring API error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to get memory report' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, thresholds } = body;
        const memoryManager = MemoryManager.getInstance();

        if (action === 'cleanup') {
            console.log('🧹 Manual cleanup triggered via API');
            const result = await memoryManager.forceCleanup();
            
            return NextResponse.json({
                success: result.success,
                data: result,
                message: result.success 
                    ? `Cleanup completed: freed ${Math.round(result.freedMemory / 1024 / 1024)}MB`
                    : `Cleanup failed: ${result.error}`
            });
        }

        if (action === 'updateThresholds' && thresholds) {
            const { warning, critical } = thresholds;
            memoryManager.updateThresholds(warning, critical);
            
            return NextResponse.json({
                success: true,
                message: `Thresholds updated: Warning=${warning}MB, Critical=${critical}MB`
            });
        }

        return NextResponse.json(
            { success: false, error: 'Invalid action' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Memory management API error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to process memory management request' },
            { status: 500 }
        );
    }
}