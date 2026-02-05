

# LectureSnap - Jargon Capture & Explanation App

A native mobile app that helps students capture and understand complex terminology during lectures by recording key moments with context.

---

## Core Experience

### Moment Capture Recording
- **Continuous background buffering** - App silently records in a rolling 60-second buffer
- **Tap to capture** - When you hear unfamiliar jargon, tap the capture button
- **Context window** - Saves the last 30-60 seconds before tap plus 15-20 seconds after
- **Transcription** - Audio is transcribed and jargon words are highlighted

### AI-Powered Jargon Explanation
- **Smart detection** - AI identifies technical terms and jargon in the transcript
- **Contextual explanations** - Explains terms based on how they were used in the lecture
- **Inline cards** - Tap any highlighted term to see its explanation

### Explanation Styles (Account Setting)
Users can choose their preferred explanation level:
- **ELI5** - Super simple, everyday language
- **Teen (16)** - Clear but more complete explanations
- **Academic** - Formal definitions with proper terminology
- **Medical/Legal/Tech** - Field-specific explanation styles (future)

---

## Features

### Jargon Library
- **Save terms** - Save any explained term to your personal library
- **Organize by subject** - Group terms by course or topic
- **Review history** - See past captured moments and their terms

### Focus Mode (Post-Lecture Review)
- **Flashcard-style review** - Quiz yourself on saved terms
- **Spaced repetition** - Smart review scheduling for better retention
- **Progress tracking** - See which terms you've mastered

### User Accounts
- **Sign up / Login** - Email-based authentication
- **Profile settings** - Set default explanation style
- **Cross-device sync** - Access your jargon library anywhere

---

## Technical Approach

### Native Mobile App
- Built with Capacitor for iOS/Android
- Background audio buffering capability
- Push to App Store / Google Play

### Backend (Lovable Cloud)
- User authentication & profiles
- Jargon library storage & sync
- AI integration for transcription & explanations

### AI Services
- **Transcription** - ElevenLabs real-time speech-to-text
- **Jargon explanation** - Lovable AI (Gemini) for contextual explanations

---

## User Flow

1. **Open app** → Recording starts buffering in background
2. **Hear jargon** → Tap capture button
3. **See transcript** → Highlighted terms appear as cards
4. **Tap term** → Get explanation in your preferred style
5. **Save term** → Add to your jargon library
6. **After lecture** → Enter Focus Mode to review saved terms

