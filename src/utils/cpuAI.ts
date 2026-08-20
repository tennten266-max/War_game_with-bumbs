// src/utils/cpuAI.ts
import { Vector2D, Bomb, BombMode } from '@/types/game';

export interface CpuAction {
  moveVector: Vector2D;
  shouldPlaceBomb: boolean;
}

interface CpuAiParams {
  cpuPos: Vector2D;
  playerPos: Vector2D;
  bombs: Bomb[];
  bombMode: BombMode;
  lastCpuBombTime: number;
  now: number;
}

const FIELD_MIN = 20;
const FIELD_MAX = 380;
const TANK_RADIUS = 14;
const DANGER_MARGIN = 20; // 爆発半径(50) + タンク半径(14) + マージン

/**
 * ある地点 (x, y) が設置されている爆弾の危険範囲内かどうか判定する
 */
function isPositionInDanger(x: number, y: number, bombs: Bomb[], now: number): boolean {
  for (const bomb of bombs) {
    const elapsed = now - bomb.createdAt;
    if (elapsed < bomb.armTime) {
      const dangerDist = bomb.radius + TANK_RADIUS + DANGER_MARGIN;
      const dist = Math.hypot(x - bomb.x, y - bomb.y);
      if (dist < dangerDist) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 地点 (x, y) の危険度スコアを計算（低いほど安全）
 */
function evaluatePositionSafety(x: number, y: number, bombs: Bomb[], now: number): number {
  if (x < FIELD_MIN || x > FIELD_MAX || y < FIELD_MIN || y > FIELD_MAX) {
    return 99999; // 壁の外は絶対NG
  }

  let penalty = 0;
  for (const bomb of bombs) {
    const elapsed = now - bomb.createdAt;
    if (elapsed < bomb.armTime) {
      const remainingTime = Math.max(100, bomb.armTime - elapsed);
      const dangerDist = bomb.radius + TANK_RADIUS + DANGER_MARGIN;
      const dist = Math.hypot(x - bomb.x, y - bomb.y);
      if (dist < dangerDist) {
        // 爆発が迫っている爆弾ほど大きなペナルティ
        const timeFactor = (2500 / remainingTime);
        const distFactor = (dangerDist - dist) / dangerDist;
        penalty += timeFactor * distFactor * 1000;
      }
    }
  }
  return penalty;
}

/**
 * Utility AI + 回避経路探索により、CPUの次の一手を決定する
 */
export function computeCpuAction({
  cpuPos,
  playerPos,
  bombs,
  bombMode,
  lastCpuBombTime,
  now,
}: CpuAiParams): CpuAction {
  const isCurrentlyInDanger = isPositionInDanger(cpuPos.x, cpuPos.y, bombs, now);

  // 1. 【緊急回避（Dodge）】現在地が爆弾の危険範囲内にある場合
  if (isCurrentlyInDanger) {
    let bestVector: Vector2D = { x: 0, y: 0 };
    let lowestScore = evaluatePositionSafety(cpuPos.x, cpuPos.y, bombs, now);

    // 16方向に探索レイを飛ばし、最も安全な移動方向を決定
    const directions = 16;
    const stepDist = 30;

    for (let i = 0; i < directions; i++) {
      const angle = (i * 2 * Math.PI) / directions;
      const testX = Math.max(FIELD_MIN, Math.min(FIELD_MAX, cpuPos.x + Math.cos(angle) * stepDist));
      const testY = Math.max(FIELD_MIN, Math.min(FIELD_MAX, cpuPos.y + Math.sin(angle) * stepDist));

      const score = evaluatePositionSafety(testX, testY, bombs, now);
      if (score < lowestScore) {
        lowestScore = score;
        bestVector = {
          x: Math.cos(angle),
          y: Math.sin(angle),
        };
      }
    }

    // 移動ベクトルを正規化
    const len = Math.hypot(bestVector.x, bestVector.y);
    const moveVector = len > 0.01 ? { x: bestVector.x / len, y: bestVector.y / len } : { x: 0, y: 0 };

    return {
      moveVector,
      shouldPlaceBomb: false, // 危険回避中は自機が死ぬため爆弾を置かない
    };
  }

  // 2. 【攻撃判断（Attack / Place Bomb）】手動モード時、安全でプレイヤーが射程内の場合に爆弾設置
  let shouldPlaceBomb = false;
  const distToPlayer = Math.hypot(playerPos.x - cpuPos.x, playerPos.y - cpuPos.y);

  if (bombMode === 'manual') {
    const cooldownMs = 2200;
    const isCooldownReady = now - lastCpuBombTime >= cooldownMs;

    // プレイヤーが爆風範囲（約45〜85px）におり、CPU自身に逃げ道があるか確認
    if (isCooldownReady && distToPlayer >= 40 && distToPlayer <= 85) {
      // 自分が今爆弾を置いたと仮定して、逃げられる安全なマスがあるか確認
      const simulatedBomb: Bomb = {
        id: 'sim',
        x: cpuPos.x,
        y: cpuPos.y,
        owner: 'guest',
        createdAt: now,
        armTime: 2500,
        radius: 50,
      };
      const simulatedBombs = [...bombs, simulatedBomb];

      // 4方向に退避可能かチェック
      const canEscape = [
        { x: cpuPos.x + 65, y: cpuPos.y },
        { x: cpuPos.x - 65, y: cpuPos.y },
        { x: cpuPos.x, y: cpuPos.y + 65 },
        { x: cpuPos.x, y: cpuPos.y - 65 },
      ].some(
        (spot) =>
          spot.x >= FIELD_MIN &&
          spot.x <= FIELD_MAX &&
          spot.y >= FIELD_MIN &&
          spot.y <= FIELD_MAX &&
          !isPositionInDanger(spot.x, spot.y, simulatedBombs, now)
      );

      if (canEscape) {
        shouldPlaceBomb = true;
      }
    }
  }

  // 3. 【追従・間合い調整（Chase / Spacing）】安全な時の移動
  let targetDx = playerPos.x - cpuPos.x;
  let targetDy = playerPos.y - cpuPos.y;
  const currentDist = Math.hypot(targetDx, targetDy);

  let desiredVector: Vector2D = { x: 0, y: 0 };

  if (currentDist > 80) {
    // 遠すぎる場合はプレイヤーへ近づく
    desiredVector = { x: targetDx / currentDist, y: targetDy / currentDist };
  } else if (currentDist < 50) {
    // 近すぎる場合は少し後退して間合いをキープ
    desiredVector = { x: -targetDx / currentDist, y: -targetDy / currentDist };
  } else {
    // 適正距離（50〜80px）の場合は円を描くように横移動（サイドステップ）
    desiredVector = { x: -targetDy / currentDist, y: targetDx / currentDist };
  }

  // 移動先の候補が爆弾の危険ゾーンに突っ込まないように確認・補正
  const candidateX = Math.max(FIELD_MIN, Math.min(FIELD_MAX, cpuPos.x + desiredVector.x * 25));
  const candidateY = Math.max(FIELD_MIN, Math.min(FIELD_MAX, cpuPos.y + desiredVector.y * 25));

  if (isPositionInDanger(candidateX, candidateY, bombs, now)) {
    // 迂回方向を探す（直交ベクトル）
    const alt1 = { x: -desiredVector.y, y: desiredVector.x };
    const alt2 = { x: desiredVector.y, y: -desiredVector.x };

    const score1 = evaluatePositionSafety(cpuPos.x + alt1.x * 25, cpuPos.y + alt1.y * 25, bombs, now);
    const score2 = evaluatePositionSafety(cpuPos.x + alt2.x * 25, cpuPos.y + alt2.y * 25, bombs, now);

    desiredVector = score1 < score2 ? alt1 : alt2;
  }

  const len = Math.hypot(desiredVector.x, desiredVector.y);
  const moveVector = len > 0.01 ? { x: desiredVector.x / len, y: desiredVector.y / len } : { x: 0, y: 0 };

  return {
    moveVector,
    shouldPlaceBomb,
  };
}
