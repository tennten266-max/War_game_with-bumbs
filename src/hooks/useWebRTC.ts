// src/hooks/useWebRTC.ts
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { ClientMessage, HostMessage } from '@/types/game';

export function useWebRTC() {
  const [peerId, setPeerId] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [role, setRole] = useState<'host' | 'guest' | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const messageCallbackRef = useRef<((data: any) => void) | null>(null);

  useEffect(() => {
    let peerInstance: Peer | null = null;

    import('peerjs').then(({ default: Peer }) => {
      const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
      peerInstance = new Peer(randomId);

      peerInstance.on('open', (id) => {
        setPeerId(id);
      });

      peerInstance.on('connection', (conn) => {
        connRef.current = conn;
        setRole('host');
        setupConnectionListeners(conn);
      });

      peerRef.current = peerInstance;
    });

    return () => {
      peerInstance?.destroy();
    };
  }, []);

  const setupConnectionListeners = (conn: DataConnection) => {
    conn.on('open', () => {
      setIsConnected(true);
    });

    conn.on('data', (data) => {
      if (messageCallbackRef.current) {
        messageCallbackRef.current(data);
      }
    });

    conn.on('close', () => {
      setIsConnected(false);
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
    });
  };

  const connectToHost = useCallback((hostId: string) => {
    if (!peerRef.current) return;

    const conn = peerRef.current.connect(hostId.toUpperCase(), {
      reliable: true,
    });

    connRef.current = conn;
    setRole('guest');
    setupConnectionListeners(conn);
  }, []);

  const sendMessage = useCallback((data: ClientMessage | HostMessage) => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send(data);
    }
  }, []);

  const onMessage = useCallback((callback: (data: any) => void) => {
    messageCallbackRef.current = callback;
  }, []);

  return {
    peerId,
    isConnected,
    role,
    connectToHost,
    sendMessage,
    onMessage,
  };
}