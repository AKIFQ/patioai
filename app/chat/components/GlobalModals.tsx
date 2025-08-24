'use client';

import React from 'react';
import { useSWRConfig } from 'swr';
import { useModalContext } from '../contexts/ModalContext';
import CreateRoomModal from './CreateRoomModal';
import JoinRoomModal from './JoinRoomModal';

export default function GlobalModals() {
  const { mutate } = useSWRConfig();
  const {
    isCreateRoomModalOpen,
    closeCreateRoomModal,
    isJoinRoomModalOpen,
    closeJoinRoomModal,
  } = useModalContext();

  const handleRoomCreated = () => {
    // Refresh both room lists to show the new room immediately
    mutate('rooms');
    mutate('roomChats');
    closeCreateRoomModal();
  };

  return (
    <>
      {/* Create Room Modal */}
      <CreateRoomModal
        isOpen={isCreateRoomModalOpen}
        onClose={closeCreateRoomModal}
        onRoomCreated={handleRoomCreated}
      />

      {/* Join Room Modal - For room link/code input only */}
      <JoinRoomModal
        isOpen={isJoinRoomModalOpen}
        onClose={closeJoinRoomModal}
      />
    </>
  );
} 