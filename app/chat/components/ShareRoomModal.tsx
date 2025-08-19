'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Share2, 
  QrCode,
  Copy,
  Check
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

  const defaultMessage = `Join me in "${room.name}" - a secure chat room! 🔐\n\nRoom Code: ${room.shareCode}\nPassword: ${room.password}\n\nClick the link to join: ${shareableLink}`;

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
    const url = `https://wa.me/?text=${message}`;
    window.open(url, '_blank');
  };

  const handleTelegramShare = () => {
    const message = encodeURIComponent(defaultMessage);
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareableLink)}&text=${encodeURIComponent(room.name)}`;
    window.open(url, '_blank');
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`Join me in "${room.name}"`);
    const body = encodeURIComponent(defaultMessage);
    const url = `mailto:?subject=${subject}&body=${body}`;
    window.open(url);
  };

  const handleSMSShare = () => {
    const message = defaultMessage;
    const url = `sms:?body=${encodeURIComponent(message)}`;
    window.open(url);
  };

  const handleTwitterShare = () => {
    const text = encodeURIComponent(`${room.name} - Join my secure chat room! 🔐\n\nRoom Code: ${room.shareCode}\nPassword: ${room.password}\n\n${shareableLink}`);
    const url = `https://twitter.com/intent/tweet?text=${text}`;
    window.open(url, '_blank');
  };

  const handleFacebookShare = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareableLink)}&quote=${encodeURIComponent(`Join me in "${room.name}" - a secure chat room!`)}`;
    window.open(url, '_blank');
  };

  const handleInstagramShare = () => {
    // Instagram doesn't support direct link sharing, so we copy to clipboard
    const message = defaultMessage;
    navigator.clipboard.writeText(message).then(() => {
      toast.success('Message copied! You can now paste it in Instagram');
    }).catch(() => {
      toast.error('Failed to copy message');
    });
  };

  const handleLinkedInShare = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareableLink)}`;
    window.open(url, '_blank');
  };

  const handleQRCodeDownload = () => {
    // Generate QR code for the shareable link
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareableLink)}`;
    
    // Create a temporary link to download the QR code
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = `room-${room.shareCode}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('QR code downloaded!');
  };

  const shareOptions: ShareOption[] = [
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/></svg>,
      color: 'bg-green-500 hover:bg-green-600',
      action: handleWhatsAppShare,
      description: 'Share via WhatsApp message'
    },
    {
      id: 'telegram',
      name: 'Telegram',
      icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>,
      color: 'bg-blue-500 hover:bg-blue-600',
      action: handleTelegramShare,
      description: 'Share via Telegram'
    },
    {
      id: 'email',
      name: 'Email',
      icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>,
      color: 'bg-gray-500 hover:bg-gray-600',
      action: handleEmailShare,
      description: 'Send via email'
    },
    {
      id: 'sms',
      name: 'SMS',
      icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9 11H7V9h2v2zm4 0h-2V9h2v2zm4 0h-2V9h2v2z"/></svg>,
      color: 'bg-blue-600 hover:bg-blue-700',
      action: handleSMSShare,
      description: 'Send via text message'
    },
    {
      id: 'twitter',
      name: 'Twitter',
      icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.665 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>,
      color: 'bg-sky-500 hover:bg-sky-600',
      action: handleTwitterShare,
      description: 'Share on Twitter'
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
      color: 'bg-blue-600 hover:bg-blue-700',
      action: handleFacebookShare,
      description: 'Share on Facebook'
    },
    {
      id: 'instagram',
      name: 'Instagram',
      icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 6.62 5.367 11.987 11.988 11.987 6.62 0 11.987-5.367 11.987-11.987C24.014 5.367 18.637.001 12.017.001zM8.449 16.988c-1.297 0-2.448-.49-3.323-1.297C4.198 14.895 3.708 13.744 3.708 12.447s.49-2.448 1.418-3.323c.875-.807 2.026-1.297 3.323-1.297s2.448.49 3.323 1.297c.928.875 1.418 2.026 1.418 3.323s-.49 2.448-1.418 3.323c-.875.807-2.026 1.297-3.323 1.297zm7.718-1.297c-.49.49-1.078.807-1.767.807-.69 0-1.277-.317-1.767-.807-.49-.49-.807-1.078-.807-1.767s.317-1.277.807-1.767c.49-.49 1.078-.807 1.767-.807.69 0 1.277.317 1.767.807.49.49.807 1.078.807 1.767s-.317 1.277-.807 1.767z"/></svg>,
      color: 'bg-pink-500 hover:bg-pink-600',
      action: handleInstagramShare,
      description: 'Copy message for Instagram'
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
      color: 'bg-blue-700 hover:bg-blue-800',
      action: handleLinkedInShare,
      description: 'Share on LinkedIn'
    },
    {
      id: 'copy-link',
      name: 'Copy Link',
      icon: <Copy className="h-5 w-5" />,
      color: 'bg-gray-600 hover:bg-gray-700',
      action: handleCopyLink,
      description: 'Copy room link to clipboard'
    },
    {
      id: 'copy-message',
      name: 'Copy Message',
      icon: <Copy className="h-5 w-5" />,
      color: 'bg-purple-600 hover:bg-purple-700',
      action: handleCopyMessage,
      description: 'Copy full message with room details'
    }
  ];

  // Shared header
  const ShareHeader = (
    <div className="flex-shrink-0 p-0 space-y-0">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Share Room</h2>
        </div>
      </div>
    </div>
  );

  // Shared content
  const ShareContent = (
    <div 
      className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-6 min-h-0"
      style={{ 
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y'
      }}
    >
      <div className="space-y-4 pb-safe">
        {/* Description */}
        <div className="text-sm text-muted-foreground/80 px-1">
          Share "{room.name}" with others using any of these platforms
        </div>

        {/* Room Info */}
        <div className="bg-muted/30 p-4 rounded-lg space-y-3 border border-border/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Room Name</Label>
              <p className="font-medium">{room.name}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Share Code</Label>
              <p className="font-mono text-muted-foreground/80">{room.shareCode}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Password</Label>
              <p className="font-mono text-muted-foreground/80">
                {room.password && room.password !== 'Password loading...' ? (
                  room.password
                ) : (
                  <span className="text-muted-foreground/60">Loading...</span>
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Max Participants</Label>
              <p className="text-muted-foreground/80 font-medium">{room.maxParticipants}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Password Expires</Label>
              <p className="text-muted-foreground/80 font-medium">
                {room.passwordExpiresAt ? (
                  (() => {
                    const expiryDate = new Date(room.passwordExpiresAt);
                    const now = new Date();
                    const timeDiff = expiryDate.getTime() - now.getTime();
                    const hoursRemaining = Math.ceil(timeDiff / (1000 * 60 * 60));
                    
                    if (hoursRemaining <= 0) {
                      return <span className="text-red-600">Expired</span>;
                    } else if (hoursRemaining < 24) {
                      return `${hoursRemaining} hours remaining`;
                    } else {
                      const daysRemaining = Math.ceil(hoursRemaining / 24);
                      return `${daysRemaining} days remaining`;
                    }
                  })()
                ) : (
                  '36 hours from creation'
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">Room Expires</Label>
              <p className="text-muted-foreground/80 font-medium">
                {new Date(room.expiresAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Share Options Grid */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-muted-foreground/80">Share via Platform</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
            {shareOptions.map((option) => (
              <div
                key={option.id}
                onClick={option.action}
                className={`${option.color} text-white rounded-lg p-3 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-95 touch-manipulation`}
                title={option.description}
                style={{ minHeight: '70px' }}
              >
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="text-xl">
                    {option.icon}
                  </div>
                  <span className="text-xs font-medium leading-tight">{option.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Tools */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-muted-foreground/80">Additional Tools</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleQRCodeDownload}
              size="sm"
              className="flex items-center justify-center gap-2 h-9"
            >
              <QrCode className="h-4 w-4" />
              Download QR Code
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowQRCode(!showQRCode)}
              size="sm"
              className="flex items-center justify-center gap-2 h-9"
            >
              <QrCode className="h-4 w-4" />
              {showQRCode ? 'Hide' : 'Show'} QR Code
            </Button>
          </div>
          
          {showQRCode && (
            <div className="flex justify-center p-4 bg-muted/30 rounded-lg border border-border/40">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareableLink)}`}
                alt="Room QR Code"
                className="border border-border/40 rounded-lg max-w-full h-auto"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent 
          side="bottom" 
          className="h-[85vh] max-h-[700px] p-0 gap-0 flex flex-col rounded-t-xl border-t-2"
          style={{ 
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y'
          }}
        >
          {/* Drag handle - make it more prominent */}
          <div className="w-16 h-2 rounded-full bg-muted-foreground/30 mx-auto mt-3 mb-2" />
          {ShareHeader}
          {ShareContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Share2 className="h-5 w-5" />
            Share Room
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base">
            Share "{room.name}" with others using any of these platforms
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 sm:space-y-8">
          {/* Room Info */}
          <div className="bg-muted/30 p-4 rounded-lg space-y-4 border border-border/40">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Room Name
                </Label>
                <p className="font-medium text-base">{room.name}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Share Code
                </Label>
                <p className="font-mono text-muted-foreground/80 text-base">{room.shareCode}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Password
                </Label>
                <p className="font-mono text-muted-foreground/80 text-base">
                  {room.password && room.password !== 'Password loading...' ? (
                    room.password
                  ) : (
                    <span className="text-muted-foreground/60">Loading...</span>
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Max Participants
                </Label>
                <p className="text-muted-foreground/80 font-medium text-base">{room.maxParticipants}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Password Expires
                </Label>
                <p className="text-muted-foreground/80 font-medium text-base">
                  {room.passwordExpiresAt ? (
                    (() => {
                      const expiryDate = new Date(room.passwordExpiresAt);
                      const now = new Date();
                      const timeDiff = expiryDate.getTime() - now.getTime();
                      const hoursRemaining = Math.ceil(timeDiff / (1000 * 60 * 60));
                      
                      if (hoursRemaining <= 0) {
                        return <span className="text-red-600">Expired</span>;
                      } else if (hoursRemaining < 24) {
                        return `${hoursRemaining} hours remaining`;
                      } else {
                        const daysRemaining = Math.ceil(hoursRemaining / 24);
                        return `${daysRemaining} days remaining`;
                      }
                    })()
                  ) : (
                    '36 hours from creation'
                  )}
                </p>
              </div>
            </div>
        </div>

        {/* Share Options Grid */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Share via Platform</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {shareOptions.map((option) => (
              <div
                key={option.id}
                onClick={option.action}
                className={`${option.color} text-white rounded-lg p-4 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-95`}
                title={option.description}
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="text-2xl sm:text-xl">
                    {option.icon}
                  </div>
                  <span className="text-xs sm:text-sm font-medium leading-tight">{option.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Tools */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Additional Tools</Label>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={handleQRCodeDownload}
              className="flex items-center justify-center gap-2 py-3 px-4 text-sm"
            >
              <QrCode className="h-4 w-4" />
              Download QR Code
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowQRCode(!showQRCode)}
              className="flex items-center justify-center gap-2 py-3 px-4 text-sm"
            >
              <QrCode className="h-4 w-4" />
              {showQRCode ? 'Hide' : 'Show'} QR Code
            </Button>
          </div>
          
          {showQRCode && (
            <div className="flex justify-center p-4 sm:p-6 bg-muted/30 rounded-lg border">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareableLink)}`}
                alt="Room QR Code"
                className="border rounded-lg max-w-full h-auto"
              />
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="flex flex-col sm:flex-row gap-3 pt-4">
        <Button 
          onClick={onClose} 
          variant="outline"
          className="w-full sm:w-auto py-3 px-6 text-sm"
        >
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  );
} 