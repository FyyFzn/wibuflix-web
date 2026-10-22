# Wibuflix Web Client

Modern web streaming frontend for **Wibuflix**, built with React, Vite, TypeScript, and Tailwind CSS. Exclusively designed for zero-compute edge deployment on Vercel.

## Features
- **Responsive Dark Interface:** Mobile and desktop layout matching Wibuflix dark aesthetic.
- **Adaptive Video Player:** High-performance HTML5 video player powered by `hls.js` with auto-recovery and iframe embed fallbacks.
- **Cross-Platform Watch History:** Real-time bidirectional watch progress and history synchronization with MongoDB backend and Expo mobile app.
- **HLS Transcoding Monitor:** Real-time server-sent events (SSE) queue manager for active Azure HLS transcode tasks.
- **Search & Catalog:** Instant genre filters, server-side search, and pagination.

## Tech Stack
- **Framework:** React 19 + Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Lucide Icons
- **Streaming Engine:** HLS.js
- **Routing:** React Router v7 (SPA with Vercel rewrites)

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Environment
Create `.env` (optional, defaults to production API):
```env
VITE_API_BASE=https://api.wibuflix.me
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
```

## Deployment
Configured for **Vercel** with SPA rewrite rules in `vercel.json`.
