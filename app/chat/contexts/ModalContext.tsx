'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ModalContextType {
  // Room creation modal
  isCreateRoomModalOpen: boolean;
  openCreateRoomModal: () => void;
  closeCreateRoomModal: () => void;
  
  // Join room modal
  isJoinRoomModalOpen: boolean;
  openJoinRoomModal: () => void;
  closeJoinRoomModal: () => void;
  
  // Create group modal
  isCreateGroupModalOpen: boolean;
  openCreateGroupModal: () => void;
  closeCreateGroupModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function useModalContext() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModalContext must be used within a ModalProvider');
  }
  return context;
}

interface ModalProviderProps {
  children: ReactNode;
}

export function ModalProvider({ children }: ModalProviderProps) {
  const [isCreateRoomModalOpen, setIsCreateRoomModalOpen] = useState(false);
  const [isJoinRoomModalOpen, setIsJoinRoomModalOpen] = useState(false);
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);

  const openCreateRoomModal = () => setIsCreateRoomModalOpen(true);
  const closeCreateRoomModal = () => setIsCreateRoomModalOpen(false);
  
  const openJoinRoomModal = () => setIsJoinRoomModalOpen(true);
  const closeJoinRoomModal = () => setIsJoinRoomModalOpen(false);
  
  const openCreateGroupModal = () => setIsCreateGroupModalOpen(true);
  const closeCreateGroupModal = () => setIsCreateGroupModalOpen(false);

  const value: ModalContextType = {
    isCreateRoomModalOpen,
    openCreateRoomModal,
    closeCreateRoomModal,
    isJoinRoomModalOpen,
    openJoinRoomModal,
    closeJoinRoomModal,
    isCreateGroupModalOpen,
    openCreateGroupModal,
    closeCreateGroupModal,
  };

  return (
    <ModalContext.Provider value={value}>
      {children}
    </ModalContext.Provider>
  );
} 