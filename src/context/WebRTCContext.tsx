// src/context/WebRTCContext.tsx
'use client';

import React, { createContext, useContext } from 'react';
import { useWebRTC } from '@/hooks/useWebRTC';
import { Vector2D, ClientMessage, HostMessage, BombMode, GameMode } from '@/types/game';

interface WebRTCContextType {
  gameMode: GameMode;
  isCpuMode: boolean;
  setGameMode: (mode: GameMode) => void;
  startCpuGame: () => void;
  peerId: string;
  isConnected: boolean;
  isConnecting: boolean;
  connectingStatus: string;
  connectionError: string | null;
  setConnectionError: (err: string | null) => void;
  role: 'host' | 'guest' | null;
  playerName: string;
  setPlayerName: (name: string) => void;
  bombMode: BombMode;
  setBombMode: (mode: BombMode) => void;
  bombInterval: number;
  setBombInterval: (interval: number) => void;
  opponentName: string;
  opponentBombMode: BombMode;
  opponentBombInterval: number;
  startHosting: () => void;
  connectToHost: (hostId: string) => void;
  disconnect: () => void;
  sendMessage: (data: ClientMessage | HostMessage) => void;
  onMessage: (callback: (data: any) => void) => () => void;
}

const WebRTCContext = createContext<WebRTCContextType | null>(null);

export function WebRTCProvider({ children }: { children: React.ReactNode }) {
  const webrtc = useWebRTC();

  return (
    <WebRTCContext.Provider value={webrtc}>
      {children}
    </WebRTCContext.Provider>
  );
}

export function useWebRTCContext() {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTCContext must be used within a WebRTCProvider');
  }
  return context;
}