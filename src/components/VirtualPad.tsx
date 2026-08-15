// src/components/VirtualPad.tsx
'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';

interface VirtualPadProps {
  /**
   * 移動ベクトルの通知コールバック
   * x, y は -1.0 〜 1.0 の範囲（斜め移動対応）
   * moves is boolean (指を置いている間 true)
   */
  onMove: (vector: { x: number; y: number; active: boolean }) => void;
  radius?: number; // パッドの半径 (px)
}

export default function VirtualPad({ onMove, radius = 55 }: VirtualPadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null);
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // 内部状態（アニメーションループ参照用）
  const currentVector = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });

  // 指・マウスの移動処理
  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!touchPos) return;

      const dx = clientX - touchPos.x;
      const dy = clientY - touchPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 半径で正規化（1.0以内に収める）
      const clampedDistance = Math.min(distance, radius);
      const angle = Math.atan2(dy, dx);

      // つまみ（スティック）の描画位置
      const knobX = Math.cos(angle) * clampedDistance;
      const knobY = Math.sin(angle) * clampedDistance;
      setKnobPos({ x: knobX, y: knobY });

      // -1.0 〜 1.0 の移動ベクトル
      const normX = Math.cos(angle) * (clampedDistance / radius);
      const normY = Math.sin(angle) * (clampedDistance / radius);

      currentVector.current = { x: normX, y: normY, active: true };
    },
    [touchPos, radius]
  );

  // タッチ開始
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    setTouchPos({ x: touch.clientX, y: touch.clientY });
    setKnobPos({ x: 0, y: 0 });
    currentVector.current = { x: 0, y: 0, active: true };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!touchPos) return;
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    setTouchPos(null);
    setKnobPos({ x: 0, y: 0 });
    currentVector.current = { x: 0, y: 0, active: false };
    onMove({ x: 0, y: 0, active: false });
  };

  // マウス操作（PCブラウザ用フォールバック）
  const handleMouseDown = (e: React.MouseEvent) => {
    setTouchPos({ x: e.clientX, y: e.clientY });
    setKnobPos({ x: 0, y: 0 });
    currentVector.current = { x: 0, y: 0, active: true };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!touchPos) return;
    handleMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    if (!touchPos) return;
    setTouchPos(null);
    setKnobPos({ x: 0, y: 0 });
    currentVector.current = { x: 0, y: 0, active: false };
    onMove({ x: 0, y: 0, active: false });
  };

  // 置くだけで動き続けるためのループ処理 (requestAnimationFrame)
  useEffect(() => {
    let animId: number;

    const loop = () => {
      if (currentVector.current.active) {
        onMove(currentVector.current);
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [onMove]);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className="relative w-full h-full touch-none select-none overflow-hidden flex items-center justify-center bg-gray-950/40 cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
    >
      {/* 非タッチ時のガイドサークル */}
      {!touchPos && (
        <div className="flex flex-col items-center justify-center pointer-events-none gap-1 opacity-70">
          <div
            className="rounded-full border border-dashed border-gray-600 flex items-center justify-center bg-gray-900/30"
            style={{ width: radius * 1.8, height: radius * 1.8 }}
          >
            <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-400 text-xs">
              🕹️
            </div>
          </div>
          <p className="text-gray-400 text-[10px] text-center font-medium">
            タッチ＆スライドして戦車を移動
          </p>
        </div>
      )}

      {/* タッチ中のジョイスティック */}
      {touchPos && (
        <div
          className="fixed pointer-events-none rounded-full border-2 border-blue-400/40 bg-gray-950/70 backdrop-blur-sm z-30 shadow-2xl transition-opacity"
          style={{
            width: radius * 2,
            height: radius * 2,
            left: touchPos.x - radius,
            top: touchPos.y - radius,
          }}
        >
          {/* 中心軸マーク */}
          <div className="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full bg-white/30" />

          {/* 移動可能エリアリング */}
          <div className="absolute inset-2 rounded-full border border-blue-500/20" />

          {/* 指で動くスティック（つまみ） */}
          <div
            className="absolute top-1/2 left-1/2 w-11 h-11 -mt-5.5 -ml-5.5 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 border-2 border-blue-300 shadow-lg shadow-blue-500/60"
            style={{
              transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            }}
          />
        </div>
      )}
    </div>
  );
}