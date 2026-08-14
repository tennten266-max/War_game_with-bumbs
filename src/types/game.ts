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

export type GameMessage =
  | { type: 'START_GAME' }
  | { type: 'MOVE'; role: 'host' | 'guest'; pos: Vector2D }
  | { type: 'PLACE_BOMB'; bomb: Bomb }
  | { type: 'DAMAGE'; targetRole: 'host' | 'guest' }
  | { type: 'RETRY' };