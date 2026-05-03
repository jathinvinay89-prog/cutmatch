# CutMatch — AI Haircut Advisor App

## Overview
A social mobile app (Expo + React Native) that analyzes your face using AI and recommends the 4 best haircuts for your face shape. Generates AI photos of you with each recommended cut. Full social features: feed, messaging, competitions.

## Architecture
- **Frontend**: Expo Router (React Native), tab-based navigation
- **Backend**: Express.js (TypeScript) on port 5000 — face analysis only, no image generation
- **Database**: PostgreSQL via Drizzle ORM
- **Face Analysis AI**: Groq (`llama-4-scout-17b-16e-instruct` vision model) via `GROQ_API_KEY` secret
- **Image Generation**: Puter.js (`puter.ai.txt2img`) — runs entirely in the browser, user-pays model
  - No developer API key required — users sign into their Puter.com account (free)
  - Only works on web (iOS/Android show scissors placeholder)
  - Blob URLs are uploaded to `/api/upload` before sharing to feed

## Screen Structure
```
app/
  auth.tsx               — Welcome, register, login, avatar setup (standard/virtual AI)
  _layout.tsx            — Root layout with auth redirect + navigation stack
  (tabs)/
    _layout.tsx          — 4-tab layout: Feed, CutMatch, Messages, Settings
    feed.tsx             — Social feed with haircut posts + voting
    index.tsx            — CutMatch: photo → AI face analysis → 4 ranked cuts + AI images
    messages.tsx         — Friends list for direct messaging
    settings.tsx         — Dark/light mode, display toggles, logout
  chat/[userId].tsx      — Direct chat with plus button: send CutMatch + CutCompetition invite
  competition/[id].tsx   — CutCompetition voting screen
```

## Key Files
- `server/routes.ts` — All API endpoints (face analysis only, no image generation)
- `server/index.ts` — Express setup (20MB body limit for base64 images)
- `shared/schema.ts` — DB schema: users, posts, ratings, friendships, directMessages, competitions
- `web/index.html` — Expo web HTML template (includes `<script src="https://js.puter.com/v2/">`)
- `app/(tabs)/index.tsx` — Main CutMatch screen: streams analysis from backend, then generates images via `puter.ai.txt2img()` on web

## Database Schema
- **users**: id, username, password (hashed), displayName, avatarUrl, bio, faceShape
- **posts**: id, userId, facePhotoUrl (base64), faceShape, faceFeatures, hasGlasses, recommendations (JSON), caption, isPublic, postType
- **ratings**: id, postId, userId, rank (which rec they voted best)
- **friendships**: id, requesterId, addresseeId, status (pending/accepted/declined)
- **directMessages**: id, senderId, receiverId, content, messageType (text/cutmatch/competition_invite), metadata (JSON), createdAt
- **competitions**: id, challengerId, challengeeId, challengerPostId, challengeePostId, challengerVotes, challengeeVotes, winnerId, status (pending/active/completed), expiresAt

## API Endpoints
- `POST /api/auth/register` — register with username + password
- `POST /api/auth/login` — login with username + password
- `POST /api/analyze-stream` — SSE: face analysis only; returns `analysis` event (with `imagePrompt` per rec) + `done` event; client generates images via Puter.js after `done`
- `GET /api/feed` — public feed posts with user info
- `POST /api/posts` — create post (facePhotoUrl stored as base64 data URL)
- `GET /api/posts/:id` — single post
- `GET /api/users/:id/posts` — user's posts
- `POST /api/posts/:id/rate` — vote on a haircut recommendation
- `POST /api/friends/request` — send friend request
- `GET /api/friends/:userId` — list accepted friends
- `GET /api/messages/:userId/:otherId` — conversation history
- `POST /api/messages` — send message (supports text/cutmatch/competition_invite types)
- `POST /api/competitions` — create competition
- `GET /api/competitions/:id` — get competition
- `POST /api/competitions/:id/submit` — submit your latest post to competition
- `POST /api/competitions/:id/vote` — vote in competition
- `POST /api/users/:id/avatar` — update avatar URL

## Context & State (context/AppContext.tsx)
- `currentUser`, `isLoadingUser` — auth state persisted in AsyncStorage
- `login(username, password)`, `register(username, password, displayName)`, `logout()`
- `uploadAvatar(userId, base64DataUrl)`
- `settings` + `updateSettings()` — dark mode, showFaceShape, showDifficulty, enableHaptics
- `colors` — theme-aware color object (DarkColors or LightColors)
- `apiBase` — resolved API base URL

## Design System
- Font: DM Sans (Regular 400, Medium 500, Bold 700)
- Background: #0A0A0A dark / #F5F0E8 light
- Gold accent: #C9A84C dark / #B8942A light
- Surfaces, borders, text colors — all in `constants/colors.ts` as DarkColors/LightColors

## Key Implementation Details
- **Tab bar overlap fix**: `TAB_BAR_HEIGHT = Platform.OS === "ios" ? 49 : Platform.OS === "android" ? 56 : 84` used as contentContainerStyle bottom padding
- **Black spot fix**: facePhotoUrl stored as `data:image/jpeg;base64,...` so it's accessible cross-device
- **Image generation flow (web)**: After `done` SSE event, frontend calls `puter.ai.txt2img(prompt)` for all 4 recs in parallel (250ms stagger). Each returns an HTMLImageElement whose `.src` is a blob URL. State updates per-image so cards populate progressively.
- **Image generation (native)**: Puter.js is browser-only — native shows scissors placeholder icon, no generation.
- **Sharing blob images**: `persistRecommendationImages()` converts blob: URLs → base64 → POST `/api/upload` → permanent server URL before any post is saved.
- **Portrait prompt**: Built client-side in `buildPortraitPrompt()` using face metadata (gender, skinTone, hairColor, ageRange, faceShape, faceFeatures, hasGlasses) + `imagePrompt` field from each recommendation.
- **Virtual AI avatar**: Takes selfie → runs analyze-stream → user picks AI haircut image as avatar
- **CutCompetition**: Create via chat plus button → both users submit their latest CutMatch → others vote
- **Passwords**: Stored hashed (SHA-256) server-side, stripped from all API responses
- **Puter.js auth**: First use triggers a Puter.com sign-in popup — this is expected. User's free Puter account pays for image generation.
