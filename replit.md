# CutMatch — AI Haircut Recommendation App

## Overview
A mobile app (Expo + React Native) that analyzes your face using AI and recommends the 4 best haircuts for your face shape. It generates AI photos of you with each recommended cut.

## Architecture
- **Frontend**: Expo Router (React Native), file-based routing, no tabs
- **Backend**: Express.js (TypeScript) on port 5000
- **AI**: OpenAI via Replit AI Integrations (no API key needed)
  - `gpt-5.1` for face analysis and haircut recommendation
  - `gpt-image-1` for generating haircut images (image editing)

## Key Files
- `app/index.tsx` — Home screen: camera/gallery photo picker
- `app/results.tsx` — Results screen: 4 ranked haircut cards with AI images
- `app/_layout.tsx` — Root layout with DM Sans font, stack navigation
- `server/routes.ts` — `/api/analyze` endpoint: face analysis + image generation
- `server/index.ts` — Express server (20MB body limit for base64 images)
- `constants/colors.ts` — Dark theme: charcoal black (#0A0A0A) + gold (#C9A84C)

## User Flow
1. User opens app → sees home screen with camera/gallery buttons
2. User takes/picks a photo of their face
3. Taps "Find My Best Cuts"
4. Backend analyzes face with GPT-5.1 vision → returns face shape, features, 4 recommendations
5. Backend generates 4 images with gpt-image-1 (user's face + new haircut)
6. Results screen shows ranked cards with AI-generated preview images

## Design System
- Font: DM Sans (Regular 400, Medium 500, Bold 700)
- Background: #0A0A0A (charcoal)
- Accent: #C9A84C (gold)
- Surface: #141414, #1E1E1E
- Border: #2A2A2A
- Text: #F5F0E8 / #8A8580 (secondary)

## Future Features (Social Media)
- Share your AI haircut results
- Compare AI vs real haircut photos
- Community feed of haircut transformations
- Save favorite recommendations

## Workflows
- `Start Backend`: `npm run server:dev` (port 5000)
- `Start Frontend`: `npm run expo:dev` (port 8081)
