# 💣 BOMB BATTLE 2D

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.3-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/WebRTC-PeerJS-P2P-FF6B6B?style=for-the-badge&logo=webrtc&logoColor=white" alt="WebRTC" />
</p>

<p align="center">
  <b>ブラウザで手軽にリアルタイムP2P対戦！爆弾を設置して相手を追い詰める2Dオンライン対戦アクションゲーム</b>
</p>

---

## ⚡️ 概要 (Overview)

**BOMB BATTLE 2D** は、Next.js 16 (Turbopack) と PeerJS (WebRTC) を活用して開発された、完全サーバーレスなP2Pオンラインリアルタイム対戦ゲームです。

中央サーバーを介さずにブラウザ同士が直接通信（Peer-to-Peer）を行うため、低遅延でスムーズな対戦体験を実現します。スマホ操作にも対応した直感的なバーチャルパッド UI を搭載しています。

---

## ✨ 主な特徴 (Features)

* 🌐 **リアルタイム P2P 通信**
  * PeerJS (WebRTC) を採用し、ホストとゲストを1対1で直接接続。
* 🎮 **マルチデバイス対応 (モバイル・PC)**
  * PCのキーボード操作はもちろん、スマホ・タブレット向けに最適化された直感的な**バーチャルパッド UI**を搭載。
* 🚀 **ルーム作成＆自動同期機能**
  * ホストが発行した「Peer ID」をシェアするだけで簡単にルーム参加。
  * ホストの「対戦を開始する」操作で両プレイヤーの画面が同時に同期スタート。
* 💣 **リアルタイム物理＆当たり判定**
  * Canvas API による高速描画と爆弾設置・爆風判定システム。

---

## 🛠 技術スタック (Tech Stack)

| カテゴリ | 技術 / ライブラリ |
| :--- | :--- |
| **Framework** | Next.js 16 (App Router / Turbopack) |
| **Language** | TypeScript |
| **Library** | React 19 |
| **Styling** | Tailwind CSS |
| **Networking** | WebRTC / PeerJS |
| **Rendering** | HTML5 Canvas API |
| **Deployment** | Vercel |

---

## 🚀 開発環境の構築 (Getting Started)

### 前提条件 (Prerequisites)
* Node.js 18.x 以上
* npm / yarn / pnpm

### インストールと起動 (Run Locally)

1. **リポジトリのクローン**
   ```bash
   git clone [https://github.com/tennten266-max/War_game_with-bumbs.git](https://github.com/tennten266-max/War_game_with-bumbs.git)
   cd War_game_with-bumbs
