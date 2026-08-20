// src/hooks/useWebRTC.ts
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Pusher, { Channel } from 'pusher-js';
import { ClientMessage, HostMessage, BombMode, GameMessage } from '@/types/game';

const PUSHER_KEY = 'abfb8a02ac2faf89a956';
const PUSHER_CLUSTER = 'ap3';

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

  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<Channel | null>(null);
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
      if (processedMessageIdsRef.current.size > 300) {
        const arr = Array.from(processedMessageIdsRef.current);
        processedMessageIdsRef.current = new Set(arr.slice(-150));
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

  // サーバーリレーポーリングループ（WebSocket補助用）
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
        // polling error ignore
      }
    };
// useWebRTC.ts 166行目付近
poll();
// 60ms は短すぎるため、1000ms (1秒) 以上に変更、または WebSocket 確立時は停止する
pollingIntervalRef.current = setInterval(poll, 1000);
  }, [dispatchMessage]);

  const stopRelayPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Pusher チャネルの購読
  const subscribeToPusherChannel = useCallback((roomId: string) => {
    if (!pusherRef.current) return;

    // 既存チャネルがあれば解除
    if (channelRef.current) {
      pusherRef.current.unsubscribe(channelRef.current.name);
      channelRef.current = null;
    }

    const channelName = `room-${roomId.toUpperCase()}`;
    const channel = pusherRef.current.subscribe(channelName);

    channel.bind('game-event', (data: any) => {
      // 自分が送信したイベントは除外（from role チェック）
      if (data && data._fromRole && data._fromRole === roleRef.current) {
        return;
      }
      const msgId = data?._id;
      dispatchMessage(data, msgId);
    });

    channelRef.current = channel;
  }, [dispatchMessage]);

  // Pusher初期化 ＆ 初期ID生成
  useEffect(() => {
    const initialId = Math.random().toString(36).substring(2, 6).toUpperCase();
    setPeerId(initialId);
    currentRoomIdRef.current = initialId;

    // Pusher WebSocket クライアント初期化
    const pusher = new Pusher(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
    });

    pusherRef.current = pusher;

    return () => {
      stopRelayPolling();
      if (channelRef.current) {
        pusher.unsubscribe(channelRef.current.name);
      }
      pusher.disconnect();
    };
  }, [stopRelayPolling]);

  // ホストとして待機開始 (1P)
  const startHosting = useCallback(() => {
    setRole('host');
    roleRef.current = 'host';
    const roomId = currentRoomIdRef.current || peerId;

    // Pusherチャネルを購読
    subscribeToPusherChannel(roomId);

    // サーバーリレーにも部屋を登録 ＆ ポーリング開始
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
  }, [peerId, subscribeToPusherChannel, startRelayPolling]);

  // ゲストとして部屋に参加 (2P)
  const connectToHost = useCallback(async (hostId: string) => {
    const cleanHostId = hostId.toUpperCase().trim();
    if (!cleanHostId) return;

    setConnectionError(null);
    setIsConnecting(true);
    setConnectingStatus('サーバー照合中...');

    currentRoomIdRef.current = cleanHostId;
    setRole('guest');
    roleRef.current = 'guest';

    // Pusher チャネルに購読
    subscribeToPusherChannel(cleanHostId);

    try {
      // サーバーリレーでルーム存在確認＆参加通知
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

      // ポーリング開始
      startRelayPolling(cleanHostId, 'guest');
    } catch {
      setIsConnecting(false);
      setConnectingStatus('');
      setConnectionError('サーバーとの通信に失敗しました。インターネット接続を確認してください。');
    }
  }, [subscribeToPusherChannel, startRelayPolling]);

  // メッセージ送信（Pusher WebSocket + 高速リレー連携）
  const sendMessage = useCallback((data: ClientMessage | HostMessage) => {
    const currentRole = roleRef.current || 'host';
    const roomId = currentRoomIdRef.current;
    if (!roomId) return;

    const msgId = `${currentRole}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const payload = { ...data, _id: msgId, _fromRole: currentRole };

    // MOVE の場合はリレーへの連続送信を 30ms にスロットル
    if (data.type === 'MOVE') {
      const now = Date.now();
      if (now - lastRelayMoveSentTimeRef.current < 30) return;
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

    if (pusherRef.current && channelRef.current) {
      pusherRef.current.unsubscribe(channelRef.current.name);
      channelRef.current = null;
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