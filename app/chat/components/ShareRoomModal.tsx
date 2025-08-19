'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Share2, 
  QrCode,
  Copy,
  Check,
  ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';


interface Room {
  id: string;
  name: string;
  shareCode: string;
  maxParticipants: number;
  tier: 'free' | 'pro';
  expiresAt: string;
  createdAt: string;
  password?: string | null;
  passwordExpiresAt?: string | null;
  createdBy?: string;
}

interface ShareRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  shareableLink: string;
}

interface ShareOption {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  action: () => void;
  description: string;
}

export default function ShareRoomModal({ isOpen, onClose, room, shareableLink }: ShareRoomModalProps) {
  const [showQRCode, setShowQRCode] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  // Mobile detection - use more reliable method
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      // Use multiple indicators for mobile detection
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 768;
      const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      setIsMobile(isTouchDevice && (isSmallScreen || isMobileUserAgent));
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Check if user is the room creator (you can pass this as a prop or determine it somehow)
  const isRoomCreator = true; // This should be determined based on actual user/room data
  
  const defaultMessage = isRoomCreator 
    ? `Let's chat with AI together!\n\nJoin me in "${room.name}" - our secure AI collaboration space where we can brainstorm, create, and explore together.\n\nRoom Code: ${room.shareCode}\nPassword: ${room.password || 'Generating secure password...'}\n\nReady to dive in? Join here: ${shareableLink}`
    : `You're invited to chat with AI!\n\nJoin "${room.name}" - a secure AI collaboration space for brainstorming, creating, and exploring together.\n\nRoom Code: ${room.shareCode}\nPassword: Ask the room creator for the current password\n\nReady to collaborate? Join here: ${shareableLink}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      setIsCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(defaultMessage);
      toast.success('Message copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy message');
    }
  };

  const handleWhatsAppShare = () => {
    const message = encodeURIComponent(defaultMessage);
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 && !isIOS;
    const isWindows = navigator.platform.toUpperCase().indexOf('WIN') >= 0;
    
    try {
      if (isIOS) {
        // iOS: Try WhatsApp app first, then fallback
        window.location.href = `whatsapp://send?text=${message}`;
        setTimeout(() => {
          window.open(`https://wa.me/?text=${message}`, '_blank');
        }, 2000);
      } else if (isAndroid) {
        // Android: Use intent or direct app URL
        const androidUrl = `intent://send?text=${message}#Intent;scheme=whatsapp;package=com.whatsapp;end`;
        window.location.href = androidUrl;
      } else if (isMac) {
        // Mac: Try desktop app then web
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `whatsapp://send?text=${message}`;
        document.body.appendChild(iframe);
        
        setTimeout(() => {
          document.body.removeChild(iframe);
          window.open(`https://web.whatsapp.com/send?text=${message}`, '_blank');
        }, 1000);
      } else {
        // Windows/Other: Web version
        window.open(`https://web.whatsapp.com/send?text=${message}`, '_blank');
      }
    } catch (error) {
      // Ultimate fallback
      window.open(`https://wa.me/?text=${message}`, '_blank');
    }
  };

  const handleTelegramShare = () => {
    const message = encodeURIComponent(defaultMessage);
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 && !isIOS;
    
    try {
      if (isIOS) {
        // iOS: Try Telegram app first
        window.location.href = `tg://msg?text=${message}`;
        setTimeout(() => {
          window.open(`https://t.me/share/url?url=${encodeURIComponent(shareableLink)}&text=${encodeURIComponent(`Join "${room.name}"`)}`, '_blank');
        }, 2000);
      } else if (isAndroid) {
        // Android: Try Telegram app
        window.location.href = `tg://msg?text=${message}`;
        setTimeout(() => {
          window.open(`https://t.me/share/url?url=${encodeURIComponent(shareableLink)}&text=${encodeURIComponent(`Join "${room.name}"`)}`, '_blank');
        }, 2000);
      } else if (isMac) {
        // Mac: Try desktop app then web
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `tg://msg?text=${message}`;
        document.body.appendChild(iframe);
        
        setTimeout(() => {
          document.body.removeChild(iframe);
          window.open(`https://web.telegram.org/a/#?text=${message}`, '_blank');
        }, 1000);
      } else {
        // Windows/Other: Web version
        window.open(`https://web.telegram.org/a/#?text=${message}`, '_blank');
      }
    } catch (error) {
      // Ultimate fallback
      window.open(`https://t.me/share/url?url=${encodeURIComponent(shareableLink)}&text=${encodeURIComponent(`Join "${room.name}"`)}`, '_blank');
    }
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`Join "${room.name}"`);
    const body = encodeURIComponent(defaultMessage);
    const url = `mailto:?subject=${subject}&body=${body}`;
    window.open(url);
  };

  const handleSMSShare = () => {
    const message = encodeURIComponent(defaultMessage);
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 && !isIOS;
    
    try {
      if (isIOS) {
        // iOS: Use sms: protocol to open Messages app
        window.location.href = `sms:&body=${message}`;
      } else if (isAndroid) {
        // Android: Use SMS intent
        window.location.href = `sms:?body=${message}`;
      } else if (isMac) {
        // Mac: Try to open Messages app
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `sms:&body=${message}`;
        document.body.appendChild(iframe);
        
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
        
        toast.success('Message prepared - please check your Messages app');
      } else {
        // Windows/Other: Copy to clipboard and show instructions
        navigator.clipboard.writeText(defaultMessage).then(() => {
          toast.success('Message copied! You can paste it in your SMS app');
        });
      }
    } catch (error) {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(defaultMessage).then(() => {
        toast.success('Message copied! You can paste it in your SMS app');
      });
    }
  };

  const handleDiscordShare = () => {
    const message = defaultMessage;
    navigator.clipboard.writeText(message).then(() => {
      toast.success('Message copied! Paste it in Discord');
      // Try to open Discord app
      const discordUrl = isMobile ? 'discord://' : 'https://discord.com/app';
      setTimeout(() => window.open(discordUrl, '_blank'), 500);
    }).catch(() => {
      toast.error('Failed to copy message');
    });
  };

  const handleSlackShare = () => {
    const message = defaultMessage;
    navigator.clipboard.writeText(message).then(() => {
      toast.success('Message copied! Paste it in Slack');
      // Try to open Slack app
      const slackUrl = isMobile ? 'slack://' : 'https://slack.com/signin';
      setTimeout(() => window.open(slackUrl, '_blank'), 500);
    }).catch(() => {
      toast.error('Failed to copy message');
    });
  };


  const shareOptions: ShareOption[] = [
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: (
        <div className="relative w-8 h-8 rounded-full bg-white flex items-center justify-center">
          <svg className="h-5 w-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
          </svg>
        </div>
      ),
      color: 'bg-green-500 hover:bg-green-600 border-green-200',
      action: handleWhatsAppShare,
      description: 'Share via WhatsApp'
    },
    {
      id: 'telegram',
      name: 'Telegram',
      icon: (
        <div className="relative w-8 h-8 rounded-full bg-white flex items-center justify-center">
          <svg className="h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
        </div>
      ),
      color: 'bg-blue-500 hover:bg-blue-600 border-blue-200',
      action: handleTelegramShare,
      description: 'Share via Telegram'
    },
    {
      id: 'discord',
      name: 'Discord',
      icon: (
        <div className="relative w-8 h-8 rounded-full bg-white flex items-center justify-center">
          <svg className="h-5 w-5 text-indigo-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
        </div>
      ),
      color: 'bg-indigo-500 hover:bg-indigo-600 border-indigo-200',
      action: handleDiscordShare,
      description: 'Copy for Discord'
    },
    {
      id: 'slack',
      name: 'Slack',
      icon: (
        <div className="relative w-8 h-8 rounded-full bg-white flex items-center justify-center">
          <svg className="h-5 w-5 text-purple-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.521-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.523 2.521h-2.521V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.521A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.523v-2.521h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
          </svg>
        </div>
      ),
      color: 'bg-purple-500 hover:bg-purple-600 border-purple-200',
      action: handleSlackShare,
      description: 'Copy for Slack'
    },
    {
      id: 'email',
      name: 'Email',
      icon: (
        <div className="relative w-8 h-8 rounded-full bg-white flex items-center justify-center">
          <svg className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
          </svg>
        </div>
      ),
      color: 'bg-gray-500 hover:bg-gray-600 border-gray-200',
      action: handleEmailShare,
      description: 'Send via email'
    },
    {
      id: 'sms',
      name: 'Messages',
      icon: (
        <div className="relative w-8 h-8 rounded-full bg-white flex items-center justify-center">
          <svg className="h-5 w-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9 11H7V9h2v2zm4 0h-2V9h2v2zm4 0h-2V9h2v2z"/>
          </svg>
        </div>
      ),
      color: 'bg-green-600 hover:bg-green-700 border-green-200',
      action: handleSMSShare,
      description: 'Send via text message'
    }
  ];

  // Shared header
  const ShareHeader = (
    <div className="flex-shrink-0 px-6 py-4 border-b border-border/40">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
          <Share2 className="h-4 w-4 text-amber-600" />
        </div>
        <div>
          <h2 className="text-lg font-medium">Share Room</h2>
          <p className="text-sm text-muted-foreground/80">Choose how to share "{room.name}"</p>
        </div>
      </div>
    </div>
  );

  // Shared content
  const ShareContent = (
    <div 
      className="flex-1 overflow-y-auto px-6 py-4 space-y-6 min-h-0"
      style={{ 
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y'
      }}
    >
      {/* Room Details Card */}
      <div className="bg-muted/30 rounded-lg p-4 border border-border/40">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Code</Label>
            <p className="font-mono text-base mt-1">{room.shareCode}</p>
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Password</Label>
            <p className="font-mono text-base mt-1">
              {room.password && room.password !== 'Password loading...' ? room.password : '•••••••'}
            </p>
          </div>
        </div>
      </div>

      {/* Share Options */}
      <div className="space-y-4">
        <Label className="text-sm font-medium">Share via</Label>
        <div className="grid grid-cols-3 gap-3">
          {shareOptions.map((option) => (
            <button
              key={option.id}
              onClick={option.action}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background border border-border/40 hover:bg-muted/50 hover:border-border transition-all duration-200 hover:scale-105 active:scale-95"
              title={option.description}
            >
              {option.icon}
              <span className="text-xs font-medium text-center leading-tight">{option.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Quick Actions</Label>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleCopyLink}
            size="sm"
            className="flex-1 h-9"
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Link
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowQRCode(!showQRCode)}
            size="sm"
            className="h-9"
          >
            <QrCode className="h-4 w-4" />
          </Button>
        </div>
        
        {showQRCode && (
          <div className="flex justify-center p-4 bg-muted/30 rounded-lg border border-border/40">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareableLink)}`}
              alt="Room QR Code"
              className="rounded-lg"
            />
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent 
          side="bottom" 
          className="h-[85vh] max-h-[700px] p-0 gap-0 flex flex-col rounded-t-xl border-t backdrop-blur-md bg-background/95"
          style={{ 
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y'
          }}
        >
          <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30 mx-auto mt-3 mb-1" />
          {ShareHeader}
          {ShareContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 flex flex-col max-h-[90vh] backdrop-blur-md bg-background/95 border-border/40">
        <VisuallyHidden>
          <DialogTitle>Share Room - {room.name}</DialogTitle>
        </VisuallyHidden>
        {ShareHeader}
        {ShareContent}
        <div className="px-6 py-4 border-t border-border/40">
          <Button 
            onClick={onClose} 
            variant="outline"
            className="w-full"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 