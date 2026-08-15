// src/types/game.ts

export interface Vector2D {
  x: number;
  y: number;
}

export interface Bomb {
  id: string;
  x: number;
  y: number;
  owner: 'host' | 'guest';
  createdAt: number;
  armTime: number;
  radius: number;
}

export interface Explosion {
  id: string;
  x: number;
  y: number;
  radius: number;
  createdAt: number;
  duration: number;
}

export type BombMode = 'manual' | 'auto';

export type GameMessage =
  | { type: 'START_GAME'; bombMode?: BombMode; bombInterval?: number }
  | { type: 'ROOM_SETTINGS'; bombMode: BombMode; bombInterval: number }
  | { type: 'HOST_CONFIG'; bombMode: BombMode; bombInterval: number }
  | { type: 'MOVE'; role: 'host' | 'guest'; pos: Vector2D }
  | { type: 'PLACE_BOMB'; bomb: Bomb }
  | { type: 'DAMAGE'; targetRole: 'host' | 'guest' }
  | { type: 'RETRY' }
  | { type: 'RETURN_TO_LOBBY' }
  | { type: 'DISCONNECT' }
  | { type: 'PLAYER_INFO'; name: string; bombMode: BombMode; bombInterval?: number };

// 既存互換用型定義
export type ClientMessage = GameMessage;
export type HostMessage = GameMessage;