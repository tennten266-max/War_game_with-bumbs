// src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWebRTCContext } from '@/context/WebRTCContext';
import { GameMessage, BombMode } from '@/types/game';
import InfoModal from '@/components/InfoModal';

const INTERVAL_OPTIONS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];

export default function HomePage() {
  const router = useRouter();
  const {
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
  } = useWebRTCContext();

  const [inputHostId, setInputHostId] = useState('');
  const [isHostCreated, setIsHostCreated] = useState(false);

  // ルーム作成 (Host)
  const handleCreateRoom = () => {
    setConnectionError(null);
    setIsHostCreated(true);
    startHosting();
  };

  // ルーム参加 (Guest)
  const handleJoinRoom = () => {
    if (!inputHostId.trim()) return;
    setConnectionError(null);
    connectToHost(inputHostId.trim());
  };

  // 退出 / キャンセル（初期画面へ戻る）
  const handleLeaveRoom = () => {
    disconnect();
    setIsHostCreated(false);
    setInputHostId('');
  };

  // ホストが「対戦を開始する」を押した時
  const handleStartGame = () => {
    sendMessage({ type: 'START_GAME', bombMode, bombInterval });
    // データチャネルへの送信完了を確実にするため少し遅延を入れて遷移
    setTimeout(() => {
      router.push('/game');
    }, 50);
  };

  // ゲスト側：ホストからの START_GAME を受信して自動遷移
  useEffect(() => {
    const unsubscribe = onMessage((data: GameMessage) => {
      if (data && data.type === 'START_GAME') {
        if (data.bombMode) {
          setBombMode(data.bombMode);
        }
        if (typeof data.bombInterval === 'number') {
          setBombInterval(data.bombInterval);
        }
        router.push('/game');
      }
    });
    return unsubscribe;
  }, [onMessage, router, setBombMode, setBombInterval]);

  const isGuest = role === 'guest';
  const isHost = role === 'host' || (!role && isHostCreated);
  const isWaitingOrConnected = (isHostCreated || isConnected || isConnecting || isGuest || role === 'host') && !connectionError;

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white p-4 select-none relative">
      <div className="w-full max-w-md space-y-5 text-center my-auto pb-12">
        {/* タイトルロゴ */}
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-amber-300 to-red-500">
            BOMB BATTLE 2D
          </h1>
          <p className="text-xs text-gray-400 font-medium">リアルタイム 2D 戦車爆弾バトル</p>
        </div>

        {/* 接続エラー表示ボックス（10秒タイムアウト時・切断時等） */}
        {connectionError && (
          <div className="p-4 bg-red-950/90 border border-red-500/70 rounded-2xl text-red-200 text-xs space-y-3 shadow-xl animate-fade-in text-left backdrop-blur-md">
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0">⚠️</span>
              <div>
                <p className="font-black text-red-300 text-sm mb-0.5">接続に失敗しました</p>
                <p className="leading-relaxed text-red-200/90">{connectionError}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleJoinRoom}
                className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 font-bold rounded-xl shadow transition active:scale-95 text-center text-xs text-white"
              >
                🔄 もう一度試す
              </button>
              <button
                type="button"
                onClick={handleLeaveRoom}
                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-xl border border-gray-600 transition active:scale-95 text-center text-xs"
              >
                🏠 ホームに戻る
              </button>
            </div>
          </div>
        )}

        {/* プレイヤー設定パネル（名前・爆弾モード・間隔） */}
        <div className="bg-gray-900/90 p-5 rounded-2xl border border-gray-800 shadow-xl space-y-4 text-left backdrop-blur-sm">
          <h2 className="text-sm font-bold text-gray-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span>⚙️</span> プレイヤー・ルール設定
            </span>
            {isGuest && (
              <span className="text-[10px] text-amber-400 font-normal bg-amber-950/60 border border-amber-600/30 px-2 py-0.5 rounded-full">
                👑 ルールはホストに同期中
              </span>
            )}
          </h2>

          {/* ユーザー名入力 */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 block">
              プレイヤー名
            </label>
            <input
              type="text"
              maxLength={12}
              placeholder="プレイヤー名を入力"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white font-bold text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>

          {/* 爆弾設置モード選択 */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-gray-400 block">
                爆弾の設置モード {isGuest ? '(ホスト側で指定)' : ''}
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isGuest}
                onClick={() => setBombMode('manual')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition ${
                  bombMode === 'manual'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm shadow-blue-500/20'
                    : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                } ${isGuest ? 'opacity-75 cursor-not-allowed' : ''}`}
              >
                <span className="text-lg mb-0.5">🎮</span>
                <span className="text-xs font-bold">手動設置</span>
                <span className="text-[10px] text-gray-400 mt-0.5">ボタンで投下</span>
              </button>

              <button
                type="button"
                disabled={isGuest}
                onClick={() => setBombMode('auto')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition ${
                  bombMode === 'auto'
                    ? 'bg-amber-600/20 border-amber-500 text-amber-300 shadow-sm shadow-amber-500/20'
                    : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                } ${isGuest ? 'opacity-75 cursor-not-allowed' : ''}`}
              >
                <span className="text-lg mb-0.5">⏱️</span>
                <span className="text-xs font-bold">自動設置</span>
                <span className="text-[10px] text-gray-400 mt-0.5">一定間隔で自動投下</span>
              </button>
            </div>

            {/* 自動設置モード時の秒数間隔選択（0.5秒〜3.0秒） */}
            {bombMode === 'auto' && (
              <div className="pt-2 border-t border-gray-800/80 space-y-1.5 animate-fade-in">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-semibold text-gray-400">
                    自動設置の間隔（秒数）
                  </label>
                  <span className="text-xs font-extrabold text-amber-400">
                    {bombInterval.toFixed(1)} 秒ごと
                  </span>
                </div>

                <div className="grid grid-cols-6 gap-1.5">
                  {INTERVAL_OPTIONS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      disabled={isGuest}
                      onClick={() => setBombInterval(val)}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition ${
                        bombInterval === val
                          ? 'bg-amber-500 border-amber-400 text-black shadow-md'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      } ${isGuest ? 'opacity-75 cursor-not-allowed' : ''}`}
                    >
                      {val.toFixed(1)}s
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ルーム作成・参加セクション */}
        {!isWaitingOrConnected ? (
          <div className="space-y-4 bg-gray-900/90 p-5 rounded-2xl border border-gray-800 shadow-xl backdrop-blur-sm">
            <button
              onClick={handleCreateRoom}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 font-bold rounded-xl shadow-lg transition active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <span>👑</span>
              <span>部屋を作成する (1P / Host)</span>
            </button>

            <div className="flex items-center my-3">
              <div className="flex-1 border-t border-gray-800"></div>
              <span className="px-3 text-xs text-gray-500 font-bold">または</span>
              <div className="flex-1 border-t border-gray-800"></div>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                placeholder="ホストのPeer IDを入力"
                value={inputHostId}
                onChange={(e) => setInputHostId(e.target.value.toUpperCase())}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-center text-base font-mono uppercase focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
              <button
                onClick={handleJoinRoom}
                disabled={!inputHostId.trim()}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 font-bold rounded-xl shadow-lg transition active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <span>⚔️</span>
                <span>部屋に参加する (2P / Guest)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-gray-900/90 p-5 rounded-2xl border border-gray-800 shadow-xl space-y-4 text-center backdrop-blur-sm">
            <div className="flex justify-between items-center bg-gray-800/80 px-3 py-2 rounded-xl text-xs">
              <span className="text-gray-400">あなたの役職:</span>
              <span className="text-yellow-400 font-bold">
                {isHost ? 'Host (1P: 青)' : 'Guest (2P: 赤)'}
              </span>
            </div>

            {isHost && (
              <div className="p-3 bg-gray-800/80 rounded-xl border border-gray-700">
                <p className="text-xs text-gray-400 mb-1">相手に伝える ルームID (Peer ID):</p>
                <p className="text-2xl font-mono font-black text-blue-400 tracking-wider select-all break-all">
                  {peerId ? peerId : <span className="text-amber-400 text-lg font-bold animate-pulse">ID登録中...</span>}
                </p>
                <p className="text-[10px] text-gray-500 mt-1">IDが表示されてから相手に参加を伝えてください</p>
              </div>
            )}

            {isConnected ? (
              <div className="space-y-3">
                <div className="p-3 bg-emerald-950/60 border border-emerald-600/40 rounded-xl text-emerald-400 font-bold text-sm">
                  ✓ 相手と接続されました！
                  {opponentName && (
                    <p className="text-xs text-emerald-300 font-normal mt-0.5">
                      対戦相手: <span className="font-bold text-white">{opponentName}</span>
                    </p>
                  )}
                  <p className="text-[11px] text-gray-300 mt-1">
                    適用ルール:{' '}
                    <span className="font-bold text-amber-300">
                      {bombMode === 'auto'
                        ? `⏱️ 自動設置 (${bombInterval.toFixed(1)}秒間隔)`
                        : '🎮 手動ボタン設置'}
                    </span>
                  </p>
                </div>

                {isHost ? (
                  <button
                    onClick={handleStartGame}
                    className="w-full py-4 bg-gradient-to-r from-red-600 to-amber-600 font-black text-xl rounded-xl shadow-xl hover:brightness-110 active:scale-[0.98] transition"
                  >
                    ⚔️ 対戦を開始する
                  </button>
                ) : (
                  <div className="p-3.5 bg-gray-800/80 rounded-xl border border-gray-700 text-yellow-300 text-sm font-bold animate-pulse">
                    ホストがゲームを開始するのを待っています...
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-gray-400 py-3 text-sm">
                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span>{isHost ? '相手の接続を待っています...' : (connectingStatus || 'ホストに接続中...')}</span>
              </div>
            )}

            {/* ホームに戻る（退出・キャンセル）ボタン */}
            <div className="pt-2 border-t border-gray-800/80">
              <button
                type="button"
                onClick={handleLeaveRoom}
                className="w-full py-2.5 bg-gray-800/90 hover:bg-gray-800 text-gray-400 hover:text-white text-xs font-semibold rounded-xl border border-gray-700/60 transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>🏠</span>
                <span>{isGuest ? '部屋を退出して戻る' : '部屋を解散して戻る'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 遊び方・ライセンス情報モーダルボタン */}
      <InfoModal />
    </main>
  );
}