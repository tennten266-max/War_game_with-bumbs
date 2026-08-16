// src/hooks/useWebRTC.ts
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { ClientMessage, HostMessage, BombMode, GameMessage } from '@/types/game';

// STUN + Open Relay TURNサーバー構成
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelay',
    credential: 'openrelay',
  },
];

export function useWebRTC() {
  const [peerId, setPeerId] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectingStatus, setConnectingStatus] = useState<string>('');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [role, setRole] = useState<'host' | 'guest' | null>(null);

  // プレイヤー設定
  const [playerName, setPlayerNameState] = useState<string>('プレイヤー');
  const [bombMode, setBombModeState] = useState<BombMode>('manual');
  const [bombInterval, setBombIntervalState] = useState<number>(2.0);

  const [opponentName, setOpponentName] = useState<string>('');
  const [opponentBombMode, setOpponentBombMode] = useState<BombMode>('manual');
  const [opponentBombInterval, setOpponentBombInterval] = useState<number>(2.0);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const roleRef = useRef<'host' | 'guest' | null>(null);
  const listenersRef = useRef<Set<(data: any) => void>>(new Set());

  // 接続リトライ関連
  const targetHostIdRef = useRef<string>('');
  const attemptCountRef = useRef<number>(0);
  const maxRetries = 3;
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const singleAttemptTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingQueueRef = useRef<(ClientMessage | HostMessage)[]>([]);

  const myInfoRef = useRef<{ name: string; bombMode: BombMode; bombInterval: number }>({
    name: 'プレイヤー',
    bombMode: 'manual',
    bombInterval: 2.0,
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
      const savedInterval = localStorage.getItem('tank_game_bomb_interval');
      if (savedInterval) {
        const parsed = parseFloat(savedInterval);
        if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 3.0) {
          setBombIntervalState(parsed);
          myInfoRef.current.bombInterval = parsed;
        }
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
        bombInterval: myInfoRef.current.bombInterval,
      });
    }
  }, []);

  const setBombMode = useCallback((mode: BombMode) => {
    setBombModeState(mode);
    myInfoRef.current.bombMode = mode;
    try {
      localStorage.setItem('tank_game_bomb_mode', mode);
    } catch {}
    // ホストとして接続中なら相手に設定変更を通知
    if (connRef.current && connRef.current.open) {
      connRef.current.send({
        type: 'ROOM_SETTINGS',
        bombMode: mode,
        bombInterval: myInfoRef.current.bombInterval,
      });
    }
  }, []);

  const setBombInterval = useCallback((interval: number) => {
    setBombIntervalState(interval);
    myInfoRef.current.bombInterval = interval;
    try {
      localStorage.setItem('tank_game_bomb_interval', interval.toString());
    } catch {}
    // ホストとして接続中なら相手に設定変更を通知
    if (connRef.current && connRef.current.open) {
      connRef.current.send({
        type: 'ROOM_SETTINGS',
        bombMode: myInfoRef.current.bombMode,
        bombInterval: interval,
      });
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (singleAttemptTimeoutRef.current) {
      clearTimeout(singleAttemptTimeoutRef.current);
      singleAttemptTimeoutRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearAllTimers();
    attemptCountRef.current = 0;
    targetHostIdRef.current = '';

    if (connRef.current) {
      if (connRef.current.open) {
        try {
          connRef.current.send({ type: 'DISCONNECT' });
        } catch {}
      }
      try {
        connRef.current.close();
      } catch {}
      connRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setConnectingStatus('');
    setRole(null);
    roleRef.current = null;
    setOpponentName('');
    setConnectionError(null);
    pendingQueueRef.current = [];
  }, [clearAllTimers]);

  const setupConnectionListeners = useCallback((conn: DataConnection) => {
    // RTCPeerConnection の ICE 接続状態監視と restartIce リトライ処理
    const attachPeerConnectionListeners = () => {
      const pc = (conn as any).peerConnection as RTCPeerConnection | undefined;
      if (pc) {
        pc.oniceconnectionstatechange = () => {
          console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
          if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
            console.warn('[WebRTC] ICE connection degraded. Attempting restartIce...');
            if (typeof pc.restartIce === 'function') {
              try {
                pc.restartIce();
              } catch (err) {
                console.error('[WebRTC] restartIce error:', err);
              }
            }
          }
        };
      }
    };

    attachPeerConnectionListeners();

    conn.on('open', () => {
      clearAllTimers();
      setIsConnected(true);
      setIsConnecting(false);
      setConnectingStatus('');
      setConnectionError(null);

      attachPeerConnectionListeners();

      // 接続確立時に自分の設定情報を相手に送信
      conn.send({
        type: 'PLAYER_INFO',
        name: myInfoRef.current.name,
        bombMode: myInfoRef.current.bombMode,
        bombInterval: myInfoRef.current.bombInterval,
      });

      // ホストであれば部屋のルールも確実に送信
      if (roleRef.current === 'host') {
        conn.send({
          type: 'ROOM_SETTINGS',
          bombMode: myInfoRef.current.bombMode,
          bombInterval: myInfoRef.current.bombInterval,
        });
      }

      // 保留中のキューメッセージをフラッシュ
      while (pendingQueueRef.current.length > 0) {
        const msg = pendingQueueRef.current.shift();
        if (msg) {
          try { conn.send(msg); } catch {}
        }
      }
    });

    conn.on('data', (data: any) => {
      if (data && typeof data === 'object') {
        if (data.type === 'DISCONNECT') {
          if (connRef.current) {
            try { connRef.current.close(); } catch {}
            connRef.current = null;
          }
          setIsConnected(false);
          setIsConnecting(false);
          setConnectingStatus('');
          setRole(null);
          roleRef.current = null;
          setOpponentName('');
        }

        if (data.type === 'PLAYER_INFO') {
          if (typeof data.name === 'string') setOpponentName(data.name);
          if (data.bombMode === 'manual' || data.bombMode === 'auto') {
            setOpponentBombMode(data.bombMode);
          }
          if (typeof data.bombInterval === 'number') {
            setOpponentBombInterval(data.bombInterval);
          }
          // ゲスト側であれば、ホストのPLAYER_INFOからルールも同期
          if (roleRef.current === 'guest') {
            if (data.bombMode === 'manual' || data.bombMode === 'auto') {
              setBombModeState(data.bombMode);
              myInfoRef.current.bombMode = data.bombMode;
            }
            if (typeof data.bombInterval === 'number') {
              setBombIntervalState(data.bombInterval);
              myInfoRef.current.bombInterval = data.bombInterval;
            }
          }
        }

        // ホストからの設定メッセージまたはSTART_GAME時にゲスト側の設定を強制同期
        if (data.type === 'ROOM_SETTINGS' || data.type === 'HOST_CONFIG' || data.type === 'START_GAME') {
          if (data.bombMode === 'manual' || data.bombMode === 'auto') {
            setBombModeState(data.bombMode);
            myInfoRef.current.bombMode = data.bombMode;
          }
          if (typeof data.bombInterval === 'number') {
            setBombIntervalState(data.bombInterval);
            myInfoRef.current.bombInterval = data.bombInterval;
          }
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
      clearAllTimers();
      setIsConnected(false);
      setIsConnecting(false);
      setConnectingStatus('');
      setRole(null);
      roleRef.current = null;
      setOpponentName('');
    });

    conn.on('error', (err) => {
      console.error('DataConnection error:', err);
    });
  }, [clearAllTimers]);

  // 単一接続試行関数（リトライ対応）
  const attemptConnectInternal = useCallback((targetHostId: string) => {
    if (!peerRef.current) return;

    if (connRef.current) {
      try { connRef.current.close(); } catch {}
      connRef.current = null;
    }

    const conn = peerRef.current.connect(targetHostId.toUpperCase(), {
      reliable: true,
    });

    connRef.current = conn;
    setRole('guest');
    roleRef.current = 'guest';
    setupConnectionListeners(conn);

    // 1回の試行が5秒以内に完了しない場合はタイムアウトして次のリトライへ
    if (singleAttemptTimeoutRef.current) clearTimeout(singleAttemptTimeoutRef.current);
    singleAttemptTimeoutRef.current = setTimeout(() => {
      if (attemptCountRef.current < maxRetries) {
        console.warn(`[WebRTC] Connection attempt ${attemptCountRef.current} timed out. Retrying...`);
        scheduleNextRetry();
      } else {
        setIsConnecting(false);
        setConnectingStatus('');
        setConnectionError('部屋が見つかりませんでした。入力したIDに間違いがないか、ホスト側が部屋作成完了画面（IDが表示された状態）になっているか確認してください。');
      }
    }, 5000);
  }, [setupConnectionListeners]);

  // 次のリトライのスケジュール関数
  const scheduleNextRetry = useCallback(() => {
    if (attemptCountRef.current >= maxRetries) {
      setIsConnecting(false);
      setConnectingStatus('');
      setConnectionError('部屋が見つかりませんでした。入力したIDに間違いがないか、ホスト側が部屋作成完了画面（IDが表示された状態）になっているか確認してください。');
      return;
    }

    attemptCountRef.current += 1;
    setConnectingStatus(`部屋を探しています... (試行 ${attemptCountRef.current}/${maxRetries})`);

    retryTimerRef.current = setTimeout(() => {
      if (targetHostIdRef.current) {
        attemptConnectInternal(targetHostIdRef.current);
      }
    }, 2000);
  }, [attemptConnectInternal]);

  // PeerJS インスタンス生成（STUN + Open Relay TURN サーバー設定 & iceTransportPolicy & pingInterval）
  useEffect(() => {
    let peerInstance: Peer | null = null;

    import('peerjs').then(({ default: Peer }) => {
      const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
      peerInstance = new Peer(randomId, {
        config: {
          iceServers: ICE_SERVERS,
          iceTransportPolicy: 'all',
          iceCandidatePoolSize: 10,
        },
        debug: 2, // debugログを強化
        pingInterval: 5000, // シグナリングサーバー接続維持
      });

      peerInstance.on('open', (id) => {
        setPeerId(id);
      });

      peerInstance.on('connection', (conn) => {
        connRef.current = conn;
        setRole('host');
        roleRef.current = 'host';
        setupConnectionListeners(conn);
      });

      peerInstance.on('error', (err: any) => {
        console.error('Peer error:', err);
        if (err.type === 'peer-unavailable') {
          // 即座にエラーにせず、リトライ試行回数が残っていれば再試行
          if (attemptCountRef.current > 0 && attemptCountRef.current < maxRetries) {
            console.warn(`[WebRTC] Peer unavailable on attempt ${attemptCountRef.current}. Scheduling retry...`);
            if (singleAttemptTimeoutRef.current) clearTimeout(singleAttemptTimeoutRef.current);
            scheduleNextRetry();
          } else if (attemptCountRef.current >= maxRetries) {
            setIsConnecting(false);
            setConnectingStatus('');
            setConnectionError('部屋が見つかりませんでした。入力したIDに間違いがないか、ホスト側が部屋作成完了画面（IDが表示された状態）になっているか確認してください。');
          }
        } else if (err.type === 'network' || err.type === 'server-error') {
          setConnectionError('ネットワーク接続エラーが発生しました。インターネット接続を確認してください。');
        }
      });

      peerRef.current = peerInstance;
    });

    return () => {
      clearAllTimers();
      peerInstance?.destroy();
    };
  }, [setupConnectionListeners, clearAllTimers, scheduleNextRetry]);

  // ゲスト側の接続開始（最大3回自動リトライ）
  const connectToHost = useCallback((hostId: string) => {
    if (!peerRef.current) return;

    clearAllTimers();
    setConnectionError(null);
    setIsConnecting(true);

    const cleanHostId = hostId.toUpperCase().trim();
    targetHostIdRef.current = cleanHostId;
    attemptCountRef.current = 1;
    setConnectingStatus(`部屋を探しています... (試行 1/${maxRetries})`);

    attemptConnectInternal(cleanHostId);
  }, [attemptConnectInternal, clearAllTimers]);

  const sendMessage = useCallback((data: ClientMessage | HostMessage) => {
    if (connRef.current && connRef.current.open) {
      try {
        connRef.current.send(data);
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    } else {
      // 接続準備中の場合はキューに蓄積
      pendingQueueRef.current.push(data);
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
    isConnecting,
    connectingStatus,
    connectionError,
    setConnectionError,
    role,
    playerName,
    setPlayerName,
    bombMode,
    setBombMode,
    bombInterval,
    setBombInterval,
    opponentName,
    opponentBombMode,
    opponentBombInterval,
    connectToHost,
    disconnect,
    sendMessage,
    onMessage,
  };
}