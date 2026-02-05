

# Implementation Plan: LectureSnap with Web Speech API

## Overview
Build the LectureSnap mobile app using Web Speech API for free, real-time transcription. The app will capture lecture moments, identify jargon, and provide contextual explanations.

---

## Phase 1: Database & Authentication Setup

### Database Tables
Create the following tables in Lovable Cloud:

| Table | Purpose |
|-------|---------|
| `profiles` | User settings (explanation style preference) |
| `captured_moments` | Recorded audio clips with transcripts |
| `jargon_terms` | Detected terms with explanations |
| `saved_terms` | User's personal jargon library |
| `subjects` | Categories for organizing terms |

### Authentication
- Email/password signup and login
- Profile creation on first sign-in
- Protected routes for authenticated users

---

## Phase 2: Core UI Components

### Pages
1. **Home/Recording** - Main capture interface with big tap button
2. **Moments** - History of captured moments
3. **Library** - Saved jargon terms organized by subject
4. **Focus Mode** - Flashcard review system
5. **Settings** - Explanation style preference

### Key Components
- `RecordingButton` - Large, prominent capture button
- `TranscriptView` - Display with highlighted jargon
- `JargonCard` - Expandable term explanation card
- `FlashCard` - Review card for Focus Mode

---

## Phase 3: Web Speech API Integration

### Implementation
- Use `webkitSpeechRecognition` / `SpeechRecognition` API
- Continuous recognition mode for lecture buffering
- Store rolling transcript buffer (last 60 seconds)
- On capture: save buffer + continue recording for 15-20 seconds

### Handling
- Graceful fallback message if browser doesn't support it
- Auto-restart on recognition end (for continuous mode)
- Handle interim vs final results

---

## Phase 4: AI Jargon Detection & Explanation

### Backend Function
Create an edge function that:
1. Receives transcript text
2. Uses Lovable AI (Gemini) to identify technical terms
3. Generates explanations based on user's preferred style
4. Returns structured jargon data

### Explanation Styles
- ELI5: Simple, everyday language
- Teen: Clear but complete
- Academic: Formal definitions

---

## Phase 5: Capacitor Setup

### Configuration
- Initialize Capacitor for iOS/Android
- Configure for hot-reload during development
- Set up proper app ID and name

---

## Technical Details

### Web Speech API Code Pattern
```text
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.continuous = true;
recognition.interimResults = true;
recognition.onresult = (event) => { /* handle transcript */ };
```

### Edge Function for Jargon Analysis
- Uses `google/gemini-2.5-flash` for fast, cost-effective processing
- Prompt engineered for jargon detection in educational context
- Returns JSON with terms and explanations

---

## Implementation Order

1. Database schema & RLS policies
2. Authentication (signup/login)
3. Basic UI shell with navigation
4. Web Speech API recording hook
5. Capture flow & transcript storage
6. AI jargon detection edge function
7. Jargon cards & explanations
8. Library & saved terms
9. Focus Mode flashcards
10. Capacitor native setup

---

## Upgrade Path
When ready to improve accuracy:
- Deepgram integration can replace Web Speech API
- Same UI, just swap the transcription hook
- $200 free credit available

