// src/components/InfoModal.tsx
'use client';

import React, { useState } from 'react';

export default function InfoModal() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* 画面右下に固定配置されるハンバーガー／ヘルプボタン */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 w-11 h-11 bg-gray-900/90 hover:bg-gray-800 border border-gray-700 text-gray-300 hover:text-white rounded-full shadow-2xl flex items-center justify-center transition active:scale-95 backdrop-blur-md"
        aria-label="遊び方とライセンス情報"
        title="遊び方・ライセンス"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* モーダルオーバーレイ */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
          <div className="relative w-full max-w-lg max-h-[85vh] bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-gray-200">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-gray-950/60">
              <h3 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-amber-300">
                🎮 BOMB BATTLE 2D ガイド
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* コンテンツエリア */}
            <div className="p-5 overflow-y-auto space-y-5 text-sm leading-relaxed">
              {/* 遊び方セクション */}
              <section className="space-y-2">
                <h4 className="font-bold text-blue-400 flex items-center gap-1.5 text-base border-b border-gray-800 pb-1">
                  <span>📖</span> 遊び方とルール
                </h4>
                <div className="space-y-2 text-xs text-gray-300 pl-1">
                  <p>
                    <strong className="text-white">【ゲームの目的】</strong>
                    <br />
                    爆弾を駆使して相手戦車にダメージを与え、先に相手のHP（3）を0にしたプレイヤーの勝利となります。
                  </p>
                  <p>
                    <strong className="text-white">【操作方法】</strong>
                    <br />
                    • <strong>移動:</strong> 画面下部のバーチャルパッド（ジョイスティック）をスライド / ドラッグして戦車を自由自在に移動。
                    <br />
                    • <strong>手動爆弾設置:</strong> 「💣 BOMB」ボタンをタップすると自機位置に爆弾を投下。
                    <br />
                    • <strong>自動爆弾設置:</strong> ホストが設定した秒数間隔（0.5秒〜3.0秒）ごとに、自機位置へ自動で爆弾が投下されます。
                  </p>
                  <p>
                    <strong className="text-white">【爆弾と爆発】</strong>
                    <br />
                    設置された爆弾は点滅しながらカウントダウンし、<strong>2.5秒後に爆発</strong>します。爆風の範囲内にいる戦車に1ダメージを与えます。
                  </p>
                </div>
              </section>

              {/* ルーム・対戦の仕組み */}
              <section className="space-y-2">
                <h4 className="font-bold text-amber-400 flex items-center gap-1.5 text-base border-b border-gray-800 pb-1">
                  <span>⚔️</span> ルームと通信の仕組み
                </h4>
                <div className="space-y-1.5 text-xs text-gray-300 pl-1">
                  <p>
                    • WebRTC（P2P直接通信）による低遅延マルチプレイヤー対戦です。
                    <br />
                    • 1P（ホスト）が部屋を作成し、発行されたPeer IDを2P（ゲスト）に伝えて参加します。
                    <br />
                    • 爆弾設置モードや自動設置の間隔は、ホスト（1P）の設定が両プレイヤーに自動同期・強制適用されます。
                    <br />
                    • 10秒間操作や通信が途絶えた場合は、自動で放置/切断検知が行われます。
                  </p>
                </div>
              </section>

              {/* ライセンス・著作権セクション */}
              <section className="space-y-2">
                <h4 className="font-bold text-emerald-400 flex items-center gap-1.5 text-base border-b border-gray-800 pb-1">
                  <span>📜</span> ライセンス & クレジット
                </h4>
                <div className="text-xs text-gray-400 space-y-1 pl-1">
                  <p>Multiplayer Tank Battle 2D Web Application</p>
                  <p className="font-mono text-[11px] text-gray-400 bg-gray-950 p-2.5 rounded-lg border border-gray-800">
                    MIT License
                    <br />
                    Built with Next.js, React, Tailwind CSS, PeerJS (WebRTC)
                  </p>
                </div>
              </section>

              {/* Copyright 表記 */}
              <div className="pt-2 text-center border-t border-gray-800/80">
                <p className="text-xs font-semibold text-gray-400">
                  🔏 Copyright (c) k-tan All Rights Reserved.
                </p>
              </div>
            </div>

            {/* フッター */}
            <div className="p-3 bg-gray-950/60 border-t border-gray-800 text-center">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 font-bold text-xs rounded-xl shadow transition active:scale-98 text-white"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
