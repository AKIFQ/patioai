'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle, Users, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface RemovedFromRoomHandlerProps {
    roomName: string;
    shareCode: string;
}

export default function RemovedFromRoomHandler({ roomName, shareCode }: RemovedFromRoomHandlerProps) {
    const router = useRouter();

    const handleSignIn = () => {
        const currentUrl = window.location.href;
        const signinUrl = `/signin?returnUrl=${encodeURIComponent(currentUrl)}`;
        window.location.href = signinUrl;
    };

    const handleGoToChat = () => {
        router.push('/chat');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-background/80 backdrop-blur-md border border-border/40 rounded-lg p-6 space-y-6 shadow-lg">
                <div className="text-center">
                    <div className="mx-auto w-12 h-12 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center mb-4">
                        <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                    </div>
                    <h2 className="text-xl font-medium mb-2">Removed from Room</h2>
                    <p className="text-sm text-muted-foreground">
                        You have been removed from the room "{roomName}"
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="text-center text-sm text-muted-foreground">
                        To continue using PatioAI and create your own rooms, please sign in with an account.
                    </div>

                    <div className="space-y-3">
                        <Button
                            onClick={handleSignIn}
                            className="w-full"
                            size="lg"
                        >
                            <LogIn className="w-4 h-4 mr-2" />
                            Sign In to Continue
                        </Button>

                        <Button
                            onClick={handleGoToChat}
                            variant="outline"
                            className="w-full"
                            size="lg"
                        >
                            <Users className="w-4 h-4 mr-2" />
                            Go to Personal Chat
                        </Button>
                    </div>

                    <div className="text-xs text-center text-muted-foreground">
                        With an account, you can create rooms, join multiple conversations, and access all features.
                    </div>
                </div>
            </div>
        </div>
    );
}