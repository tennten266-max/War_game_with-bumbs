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
  const isWebRTCOpenRef = useRef<boolean>(false);
  const roleRef = useRef<'host' | 'guest' | null>(null);
  const currentRoomIdRef = useRef<string>('');
  const listenersRef = useRef<Set<(data: any) => void>>(new Set());

  // 重複排除用メッセージID管理
  const processedMessageIdsRef = useRef<Set<string>>(new Set());
  const lastPolledMessageIdRef = useRef<string>('');
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastRelayMoveSentTimeRef = useRef<number>(0);

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

  // メッセージディスパッチ（重複を排除してリスナーに通知）
  const dispatchMessage = useCallback((data: any, msgId?: string) => {
    if (!data || typeof data !== 'object') return;

    if (msgId) {
      if (processedMessageIdsRef.current.has(msgId)) return;
      processedMessageIdsRef.current.add(msgId);
      if (processedMessageIdsRef.current.size > 200) {
        const arr = Array.from(processedMessageIdsRef.current);
        processedMessageIdsRef.current = new Set(arr.slice(-100));
      }
    }

    if (data.type === 'DISCONNECT') {
      setIsConnected(false);
      setRole(null);
      roleRef.current = null;
      setOpponentName('');
      setConnectionError('相手が退出しました。');
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

    // 登録されている全リスナーに通知
    listenersRef.current.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error('Error in message listener:', err);
      }
    });
  }, []);

  // サーバーリレーポーリングループ（WebRTC接続時は低頻度キープアライブ、未接続時は高速同期）
  const startRelayPolling = useCallback((roomId: string, currentRole: 'host' | 'guest') => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    const poll = async () => {
      if (!currentRoomIdRef.current) return;
      try {
        const res = await fetch('/api/relay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'poll_messages',
            roomId: roomId,
            role: currentRole,
            lastMessageId: lastPolledMessageIdRef.current,
          }),
        });

        if (!res.ok) return;
        const result = await res.json();

        if (result.success && Array.isArray(result.messages)) {
          for (const msg of result.messages) {
            lastPolledMessageIdRef.current = msg.id;
            dispatchMessage(msg.data, msg.id);
          }

          // 相手情報の反映
          if (result.room) {
            if (currentRole === 'host' && result.room.guestName) {
              setOpponentName(result.room.guestName);
              setIsConnected(true);
              setIsConnecting(false);
              setConnectingStatus('');
            }
            if (currentRole === 'guest' && result.room.hostName) {
              setOpponentName(result.room.hostName);
              setIsConnected(true);
              setIsConnecting(false);
              setConnectingStatus('');
              if (result.room.bombMode) {
                setBombModeState(result.room.bombMode);
                myInfoRef.current.bombMode = result.room.bombMode;
              }
              if (result.room.bombInterval) {
                setBombIntervalState(result.room.bombInterval);
                myInfoRef.current.bombInterval = result.room.bombInterval;
              }
            }
          }
        }
      } catch {
        // network polling error ignore
      }
    };

    // 初回即時実行 ＆ インターバル（WebRTC状態に応じて調整）
    poll();
    const intervalMs = isWebRTCOpenRef.current ? 400 : 70;
    pollingIntervalRef.current = setInterval(poll, intervalMs);
  }, [dispatchMessage]);

  const stopRelayPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // WebRTC Connection リスナー
  const setupWebRTCConnectionListeners = useCallback((conn: DataConnection) => {
    const pc = (conn as any).peerConnection as RTCPeerConnection | undefined;
    if (pc) {
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          if (typeof pc.restartIce === 'function') {
            try { pc.restartIce(); } catch {}
          }
        }
      };
    }

    conn.on('open', () => {
      isWebRTCOpenRef.current = true;
      setIsConnected(true);
      setIsConnecting(false);
      setConnectingStatus('');
      setConnectionError(null);

      // WebRTC接続が完了したらリレーポーリング間隔を低負荷モードへ
      if (currentRoomIdRef.current && roleRef.current) {
        startRelayPolling(currentRoomIdRef.current, roleRef.current);
      }

      // 接続確立時に自分の設定情報を相手に送信
      conn.send({
        type: 'PLAYER_INFO',
        name: myInfoRef.current.name,
        bombMode: myInfoRef.current.bombMode,
        bombInterval: myInfoRef.current.bombInterval,
      });

      if (roleRef.current === 'host') {
        conn.send({
          type: 'ROOM_SETTINGS',
          bombMode: myInfoRef.current.bombMode,
          bombInterval: myInfoRef.current.bombInterval,
        });
      }
    });

    conn.on('data', (data: any) => {
      const msgId = data?._id;
      dispatchMessage(data, msgId);
    });

    conn.on('close', () => {
      isWebRTCOpenRef.current = false;
      // WebRTC切断時はリレーを高速ポーリングに切り替えて対戦を維持
      if (currentRoomIdRef.current && roleRef.current) {
        startRelayPolling(currentRoomIdRef.current, roleRef.current);
      }
    });
  }, [dispatchMessage, startRelayPolling]);

  // PeerJS初期化 ＆ ホスト用ルーム作成
  useEffect(() => {
    let peerInstance: Peer | null = null;
    const initialId = Math.random().toString(36).substring(2, 6).toUpperCase();
    setPeerId(initialId);
    currentRoomIdRef.current = initialId;

    // サーバーリレーにホストの部屋を即座に登録
    fetch('/api/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_room',
        roomId: initialId,
        data: {
          playerName: myInfoRef.current.name,
          bombMode: myInfoRef.current.bombMode,
          bombInterval: myInfoRef.current.bombInterval,
        },
      }),
    }).catch(() => {});

    // PeerJSインスタンス生成（P2P高速通信用）
    import('peerjs').then(({ default: Peer }) => {
      peerInstance = new Peer(initialId, {
        config: {
          iceServers: ICE_SERVERS,
          iceTransportPolicy: 'all',
          iceCandidatePoolSize: 10,
        },
        debug: 1,
        pingInterval: 5000,
      });

      peerInstance.on('open', (id) => {
        setPeerId(id);
        currentRoomIdRef.current = id;
      });

      peerInstance.on('connection', (conn) => {
        // 自分がguestとして接続中の場合はhostに書き換えない
        if (roleRef.current !== 'guest') {
          connRef.current = conn;
          setRole('host');
          roleRef.current = 'host';
          setupWebRTCConnectionListeners(conn);
        } else {
          // guestの場合でもデータ接続リスナーは設定
          connRef.current = conn;
          setupWebRTCConnectionListeners(conn);
        }
      });

      peerInstance.on('error', (err: any) => {
        console.warn('Peer background notice:', err);
      });

      peerRef.current = peerInstance;
    });

    return () => {
      stopRelayPolling();
      peerInstance?.destroy();
    };
  }, [setupWebRTCConnectionListeners, stopRelayPolling]);

  // ホストとして待機開始
  const startHosting = useCallback(() => {
    setRole('host');
    roleRef.current = 'host';
    const roomId = currentRoomIdRef.current || peerId;

    // サーバーリレーを更新 ＆ ポーリング開始
    fetch('/api/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_room',
        roomId: roomId,
        data: {
          playerName: myInfoRef.current.name,
          bombMode: myInfoRef.current.bombMode,
          bombInterval: myInfoRef.current.bombInterval,
        },
      }),
    }).catch(() => {});

    startRelayPolling(roomId, 'host');
  }, [peerId, startRelayPolling]);

  // ゲストとして部屋に参加（サーバーリレー照合 ＆ WebRTC並行試行）
  const connectToHost = useCallback(async (hostId: string) => {
    const cleanHostId = hostId.toUpperCase().trim();
    if (!cleanHostId) return;

    setConnectionError(null);
    setIsConnecting(true);
    setConnectingStatus('サーバー照合中...');

    currentRoomIdRef.current = cleanHostId;
    setRole('guest');
    roleRef.current = 'guest';

    try {
      // 1. サーバーリレーでルーム存在確認＆参加
      const res = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'join_room',
          roomId: cleanHostId,
          role: 'guest',
          data: {
            playerName: myInfoRef.current.name,
          },
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        setIsConnecting(false);
        setConnectingStatus('');
        setRole(null);
        roleRef.current = null;
        setConnectionError('部屋が見つかりませんでした。入力したIDに間違いがないか、ホスト側が部屋作成完了画面（IDが表示された状態）になっているか確認してください。');
        return;
      }

      // 参加成功！
      setIsConnected(true);
      setIsConnecting(false);
      setConnectingStatus('');
      if (result.room?.hostName) setOpponentName(result.room.hostName);
      if (result.room?.bombMode) {
        setBombModeState(result.room.bombMode);
        myInfoRef.current.bombMode = result.room.bombMode;
      }
      if (result.room?.bombInterval) {
        setBombIntervalState(result.room.bombInterval);
        myInfoRef.current.bombInterval = result.room.bombInterval;
      }

      // サーバーポーリング開始
      startRelayPolling(cleanHostId, 'guest');

      // 2. WebRTC P2P直接接続も並行して試行（可能な環境なら超低遅延化）
      if (peerRef.current) {
        try {
          const conn = peerRef.current.connect(cleanHostId, { reliable: true });
          connRef.current = conn;
          setupWebRTCConnectionListeners(conn);
        } catch {}
      }
    } catch {
      setIsConnecting(false);
      setConnectingStatus('');
      setConnectionError('サーバーとの通信に失敗しました。インターネット接続を確認してください。');
    }
  }, [setupWebRTCConnectionListeners, startRelayPolling]);

  // メッセージ送信（最適化：WebRTC開通時はP2P最優先、HTTPリレーはイベント時＆フォールバック時のみ）
  const sendMessage = useCallback((data: ClientMessage | HostMessage) => {
    const currentRole = roleRef.current || 'host';
    const roomId = currentRoomIdRef.current;
    const msgId = `${currentRole}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const payload = { ...data, _id: msgId };

    const conn = connRef.current;
    const isWebRTCOpen = conn && conn.open;

    // 1. WebRTC DataChannel が開いていれば P2P 超高速送信
    if (isWebRTCOpen && conn) {
      try {
        conn.send(payload);
      } catch (err) {
        console.warn('WebRTC send error:', err);
      }

      // 重要イベント（爆弾・ダメージ・再戦・開始）のみリレーにもバックアップ送信
      const isCriticalEvent = data.type !== 'MOVE';
      if (!isCriticalEvent) {
        // MOVE は WebRTC のみで完結（HTTP不要 ➔ ラグ激減）
        return;
      }
    }

    // 2. WebRTC未接続時、または重要イベントの場合はサーバーリレーにも送信
    if (roomId) {
      // MOVE の場合はリレーへの連続送信を 60ms にスロットル
      if (data.type === 'MOVE') {
        const now = Date.now();
        if (now - lastRelayMoveSentTimeRef.current < 60) return;
        lastRelayMoveSentTimeRef.current = now;
      }

      fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_message',
          roomId: roomId,
          role: currentRole,
          data: payload,
        }),
      }).catch(() => {});
    }
  }, []);

  const setPlayerName = useCallback((name: string) => {
    setPlayerNameState(name);
    myInfoRef.current.name = name;
    try {
      localStorage.setItem('tank_game_player_name', name);
    } catch {}
    sendMessage({
      type: 'PLAYER_INFO',
      name,
      bombMode: myInfoRef.current.bombMode,
      bombInterval: myInfoRef.current.bombInterval,
    });
  }, [sendMessage]);

  const setBombMode = useCallback((mode: BombMode) => {
    setBombModeState(mode);
    myInfoRef.current.bombMode = mode;
    try {
      localStorage.setItem('tank_game_bomb_mode', mode);
    } catch {}
    sendMessage({
      type: 'ROOM_SETTINGS',
      bombMode: mode,
      bombInterval: myInfoRef.current.bombInterval,
    });
  }, [sendMessage]);

  const setBombInterval = useCallback((interval: number) => {
    setBombIntervalState(interval);
    myInfoRef.current.bombInterval = interval;
    try {
      localStorage.setItem('tank_game_bomb_interval', interval.toString());
    } catch {}
    sendMessage({
      type: 'ROOM_SETTINGS',
      bombMode: myInfoRef.current.bombMode,
      bombInterval: interval,
    });
  }, [sendMessage]);

  const disconnect = useCallback(() => {
    stopRelayPolling();
    isWebRTCOpenRef.current = false;
    const roomId = currentRoomIdRef.current;
    const currentRole = roleRef.current;

    if (roomId && currentRole) {
      fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'leave_room',
          roomId: roomId,
          role: currentRole,
        }),
      }).catch(() => {});
    }

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
    setConnectionError(null);
    processedMessageIdsRef.current.clear();
  }, [stopRelayPolling]);

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
    startHosting,
    connectToHost,
    disconnect,
    sendMessage,
    onMessage,
  };
}