// src/app/api/relay/route.ts
import { NextRequest, NextResponse } from 'next/server';

interface RelayMessage {
  id: string;
  from: 'host' | 'guest';
  timestamp: number;
  data: any;
}

interface RoomData {
  id: string;
  hostName: string;
  guestName: string;
  hostLastActive: number;
  guestLastActive: number;
  bombMode: 'manual' | 'auto';
  bombInterval: number;
  messages: RelayMessage[];
  createdAt: number;
}

// サーバー内インメモリルームストレージ（グローバル変数でホットリロード時も保持）
const globalForRelay = globalThis as unknown as {
  relayRooms: Map<string, RoomData>;
};

const rooms = globalForRelay.relayRooms || new Map<string, RoomData>();
globalForRelay.relayRooms = rooms;

// 期限切れルームのクリーンアップ（60秒以上無アクティビティ）
function cleanupExpiredRooms() {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    if (now - Math.max(room.hostLastActive, room.guestLastActive || 0) > 60000) {
      rooms.delete(id);
    }
  }
}

export async function POST(req: NextRequest) {
  cleanupExpiredRooms();

  try {
    const body = await req.json();
    const { action, roomId, role, data, lastMessageId } = body;
    const now = Date.now();

    if (!roomId && action !== 'cleanup') {
      return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
    }

    const upperRoomId = (roomId || '').toUpperCase().trim();

    // 1. ルーム作成 (Host)
    if (action === 'create_room') {
      const room: RoomData = {
        id: upperRoomId,
        hostName: data?.playerName || '1P (Host)',
        guestName: '',
        hostLastActive: now,
        guestLastActive: 0,
        bombMode: data?.bombMode || 'manual',
        bombInterval: data?.bombInterval || 2.0,
        messages: [],
        createdAt: now,
      };
      rooms.set(upperRoomId, room);
      return NextResponse.json({ success: true, room: { id: room.id, bombMode: room.bombMode, bombInterval: room.bombInterval } });
    }

    // 2. ルーム参加 (Guest)
    if (action === 'join_room') {
      const room = rooms.get(upperRoomId);
      if (!room) {
        return NextResponse.json({ success: false, error: 'ROOM_NOT_FOUND', message: '指定されたルームが存在しません' }, { status: 404 });
      }

      room.guestName = data?.playerName || '2P (Guest)';
      room.guestLastActive = now;

      // 参加通知メッセージを登録
      const joinMsg: RelayMessage = {
        id: `sys-join-${now}`,
        from: 'guest',
        timestamp: now,
        data: {
          type: 'PLAYER_INFO',
          name: room.guestName,
          bombMode: room.bombMode,
          bombInterval: room.bombInterval,
        },
      };
      room.messages.push(joinMsg);

      return NextResponse.json({
        success: true,
        room: {
          id: room.id,
          hostName: room.hostName,
          bombMode: room.bombMode,
          bombInterval: room.bombInterval,
        },
      });
    }

    // 3. メッセージ送信 (Host or Guest)
    if (action === 'send_message') {
      const room = rooms.get(upperRoomId);
      if (!room) {
        return NextResponse.json({ success: false, error: 'ROOM_NOT_FOUND' }, { status: 404 });
      }

      if (role === 'host') room.hostLastActive = now;
      if (role === 'guest') room.guestLastActive = now;

      const msgId = `${role}-${now}-${Math.random().toString(36).substring(2, 6)}`;
      const newMsg: RelayMessage = {
        id: msgId,
        from: role,
        timestamp: now,
        data: data,
      };

      // 最新50件のみ保持
      room.messages.push(newMsg);
      if (room.messages.length > 50) {
        room.messages.shift();
      }

      // 部屋設定の更新があれば保持
      if (data?.type === 'ROOM_SETTINGS') {
        if (data.bombMode) room.bombMode = data.bombMode;
        if (typeof data.bombInterval === 'number') room.bombInterval = data.bombInterval;
      }

      return NextResponse.json({ success: true, messageId: msgId });
    }

    // 4. メッセージ受信 / ポーリング (Host or Guest)
    if (action === 'poll_messages') {
      const room = rooms.get(upperRoomId);
      if (!room) {
        return NextResponse.json({ success: false, error: 'ROOM_NOT_FOUND' }, { status: 404 });
      }

      if (role === 'host') room.hostLastActive = now;
      if (role === 'guest') room.guestLastActive = now;

      // 相手からのメッセージで、指定されたlastMessageId以降のものを抽出
      let unreadMessages: RelayMessage[] = [];
      const opponentRole = role === 'host' ? 'guest' : 'host';

      if (lastMessageId) {
        const lastIdx = room.messages.findIndex((m) => m.id === lastMessageId);
        if (lastIdx >= 0) {
          unreadMessages = room.messages.slice(lastIdx + 1).filter((m) => m.from === opponentRole);
        } else {
          // 見つからない場合は相手からの最新10件
          unreadMessages = room.messages.filter((m) => m.from === opponentRole).slice(-10);
        }
      } else {
        unreadMessages = room.messages.filter((m) => m.from === opponentRole);
      }

      return NextResponse.json({
        success: true,
        messages: unreadMessages,
        room: {
          hostName: room.hostName,
          guestName: room.guestName,
          bombMode: room.bombMode,
          bombInterval: room.bombInterval,
        },
      });
    }

    // 5. ルーム退出 / 解散
    if (action === 'leave_room') {
      const room = rooms.get(upperRoomId);
      if (room) {
        if (role === 'host') {
          // ホスト退出時は部屋を削除
          rooms.delete(upperRoomId);
        } else {
          // ゲスト退出時はメッセージ送信してguestNameクリア
          room.guestName = '';
          room.messages.push({
            id: `sys-leave-${now}`,
            from: 'guest',
            timestamp: now,
            data: { type: 'DISCONNECT' },
          });
        }
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('Relay API Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
