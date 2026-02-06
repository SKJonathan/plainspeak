

## Audio Source Setting

Add a new "Audio Source" card to the Settings page with three options, and update the recording logic to use the selected source.

### What You'll See
A new settings card between "Explanation Style" and "Sign out" with three choices:
- **Microphone** -- Captures your voice only (current default behavior)
- **Computer Audio** -- Captures system/computer sounds only (e.g., a lecture video playing)
- **Both** -- Captures microphone and computer audio together

### Important Limitation
Computer audio capture only works on **desktop Chrome/Edge** browsers. On Safari, Firefox, and mobile browsers, it will fall back to microphone only. A small note will explain this in the settings.

### Technical Details

**1. Database Migration**
- Add a new enum type `audio_source` with values: `microphone`, `computer`, `both`
- Add an `audio_source` column to the `profiles` table (default: `microphone`)

**2. Settings Page (`src/pages/Settings.tsx`)**
- Add a new Card with a RadioGroup for audio source selection
- Fetch and save the `audio_source` preference alongside `explanation_style`
- Include a small note about browser compatibility

**3. Transcription Hook (`src/hooks/useElevenLabsTranscription.ts`)**
- Accept an `audioSource` parameter (`microphone | computer | both`)
- When `computer` or `both`: use `getDisplayMedia({ audio: true, video: true })` to capture system audio
- When `both`: mix the mic and system audio streams using `AudioContext` + `MediaStreamDestination`
- When `computer`: use only the system audio stream
- Pass the resulting stream to the ElevenLabs scribe connection

**4. Recording Page (`src/pages/Recording.tsx`)**
- Fetch the user's `audio_source` setting from their profile
- Pass it to the transcription hook

