'use client';

import React, { useState, useEffect } from 'react';
import ExpiredRoomModal from '@/app/chat/components/ExpiredRoomModal';

interface ExpiredRoomHandlerProps {
  shareCode: string;
  roomName: string;
  isCreator: boolean;
}

export default function ExpiredRoomHandler({
  shareCode,
  roomName,
  isCreator
}: ExpiredRoomHandlerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Open modal when component mounts
  useEffect(() => {
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="text-muted-foreground">
          Loading expired room information...
        </div>
      </div>
      
      <ExpiredRoomModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        roomName={roomName}
        shareCode={shareCode}
        isCreator={isCreator}
      />
    </div>
  );
} 