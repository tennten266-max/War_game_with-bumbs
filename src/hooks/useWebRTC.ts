// src/hooks/useWebRTC.ts
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { ClientMessage, HostMessage, BombMode, GameMessage } from '@/types/game';

export function useWebRTC() {
  const [peerId, setPeerId] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [role, setRole] = useState<'host' | 'guest' | null>(null);

  // プレイヤー設定
  const [playerName, setPlayerNameState] = useState<string>('プレイヤー');
  const [bombMode, setBombModeState] = useState<BombMode>('manual');
  const [opponentName, setOpponentName] = useState<string>('');
  const [opponentBombMode, setOpponentBombMode] = useState<BombMode>('manual');

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const listenersRef = useRef<Set<(data: any) => void>>(new Set());
  const myInfoRef = useRef<{ name: string; bombMode: BombMode }>({
    name: 'プレイヤー',
    bombMode: 'manual',
  });

  // 初回マウント時にlocalStorageから設定を読み込み
  useEffect(() => {
    try {
      const savedName = localStorage.getItem('tank_game_player_name');
      if (savedName) {
        setPlayerNameState(savedName);
        myInfoRef.current.name = savedName;
      }
      const savedMode = localStorage.getItem('tank_game_bomb_mode') as BombMode;
      if (savedMode === 'manual' || savedMode === 'auto') {
        setBombModeState(savedMode);
        myInfoRef.current.bombMode = savedMode;
      }
    } catch {
      // localStorage unavailable (SSR/private mode)
    }
  }, []);

  const setPlayerName = useCallback((name: string) => {
    setPlayerNameState(name);
    myInfoRef.current.name = name;
    try {
      localStorage.setItem('tank_game_player_name', name);
    } catch {}
    // 接続済みなら相手に通知
    if (connRef.current && connRef.current.open) {
      connRef.current.send({
        type: 'PLAYER_INFO',
        name,
        bombMode: myInfoRef.current.bombMode,
      });
    }
  }, []);

  const setBombMode = useCallback((mode: BombMode) => {
    setBombModeState(mode);
    myInfoRef.current.bombMode = mode;
    try {
      localStorage.setItem('tank_game_bomb_mode', mode);
    } catch {}
    // 接続済みなら相手に通知
    if (connRef.current && connRef.current.open) {
      connRef.current.send({
        type: 'PLAYER_INFO',
        name: myInfoRef.current.name,
        bombMode: mode,
      });
    }
  }, []);

  const setupConnectionListeners = useCallback((conn: DataConnection) => {
    conn.on('open', () => {
      setIsConnected(true);
      // 接続確立時に自分の設定情報を相手に送信
      conn.send({
        type: 'PLAYER_INFO',
        name: myInfoRef.current.name,
        bombMode: myInfoRef.current.bombMode,
      });
    });

    conn.on('data', (data: any) => {
      if (data && typeof data === 'object' && data.type === 'PLAYER_INFO') {
        if (typeof data.name === 'string') setOpponentName(data.name);
        if (data.bombMode === 'manual' || data.bombMode === 'auto') {
          setOpponentBombMode(data.bombMode);
        }
      }
      // 登録されている全リスナーに通知
      listenersRef.current.forEach((listener) => {
        try {
          listener(data);
        } catch (err) {
          console.error('Error in message listener:', err);
        }
      });
    });

    conn.on('close', () => {
      setIsConnected(false);
      setOpponentName('');
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
    });
  }, []);

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
  }, [setupConnectionListeners]);

  const connectToHost = useCallback((hostId: string) => {
    if (!peerRef.current) return;

    const conn = peerRef.current.connect(hostId.toUpperCase(), {
      reliable: true,
    });

    connRef.current = conn;
    setRole('guest');
    setupConnectionListeners(conn);
  }, [setupConnectionListeners]);

  const sendMessage = useCallback((data: ClientMessage | HostMessage) => {
    if (connRef.current && connRef.current.open) {
      try {
        connRef.current.send(data);
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    }
  }, []);

  const onMessage = useCallback((callback: (data: any) => void) => {
    listenersRef.current.add(callback);
    return () => {
      listenersRef.current.delete(callback);
    };
  }, []);

  return {
    peerId,
    isConnected,
    role,
    playerName,
    setPlayerName,
    bombMode,
    setBombMode,
    opponentName,
    opponentBombMode,
    connectToHost,
    sendMessage,
    onMessage,
  };
}