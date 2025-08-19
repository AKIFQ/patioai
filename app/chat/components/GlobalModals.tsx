'use client';

import React from 'react';
import { useModalContext } from '../contexts/ModalContext';
import CreateRoomModal from './CreateRoomModal';
import JoinRoomModal from './JoinRoomModal';

export default function GlobalModals() {
  const {
    isCreateRoomModalOpen,
    closeCreateRoomModal,
    isJoinRoomModalOpen,
    closeJoinRoomModal,
  } = useModalContext();

  return (
    <>
      {/* Create Room Modal */}
      <CreateRoomModal
        isOpen={isCreateRoomModalOpen}
        onClose={closeCreateRoomModal}
        onRoomCreated={() => {
          // This will be handled by the parent component
          closeCreateRoomModal();
        }}
      />

      {/* Join Room Modal - For room link/code input only */}
      <JoinRoomModal
        isOpen={isJoinRoomModalOpen}
        onClose={closeJoinRoomModal}
      />
    </>
  );
} 