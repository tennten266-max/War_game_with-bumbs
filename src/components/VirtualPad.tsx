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

export default function VirtualPad({ onMove, radius = 60 }: VirtualPadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null);
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // 内部状態（アニメーションループ参照用）
  const currentVector = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });

  // 指の移動処理
  const handleTouch = useCallback(
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

  // タッチ開始（タップした場所を中心に設定）
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = touch.clientX;
    const startY = touch.clientY;

    setTouchPos({ x: startX, y: startY });
    setKnobPos({ x: 0, y: 0 });
    currentVector.current = { x: 0, y: 0, active: true };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchPos) return;
    const touch = e.touches[0];
    handleTouch(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
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
      className="relative w-full h-full touch-none select-none overflow-hidden flex items-center justify-center bg-gray-950/30"
    >
      {/* タッチ中の固定・表示用案内 */}
      {!touchPos && (
        <p className="text-gray-500 text-xs text-center pointer-events-none animate-pulse">
          画面のどこかをタッチ＆スライドして移動
        </p>
      )}

      {/* タッチした位置に出現する円形ジョイスティック */}
      {touchPos && (
        <div
          className="fixed pointer-events-none rounded-full border-2 border-white/30 bg-black/40 backdrop-blur-sm transition-opacity duration-150"
          style={{
            width: radius * 2,
            height: radius * 2,
            left: touchPos.x - radius,
            top: touchPos.y - radius,
          }}
        >
          {/* 中心軸マーク */}
          <div className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-white/20" />

          {/* 指で動くスティック（つまみ） */}
          <div
            className="absolute top-1/2 left-1/2 w-10 h-10 -mt-5 -ml-5 rounded-full bg-blue-500/80 border-2 border-blue-300 shadow-lg shadow-blue-500/50"
            style={{
              transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            }}
          />
        </div>
      )}
    </div>
  );
}