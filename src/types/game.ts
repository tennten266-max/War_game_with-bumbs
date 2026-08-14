export interface Vector2D {
  x: number;
  y: number;
}

export type FieldShape = 'square' | 'rectangle' | 'triangle';

export interface GameConfig {
  player1Name: string;
  player2Name: string;
  fieldShape: FieldShape;
  bombInterval: number;
  bombArmTime: number;
}