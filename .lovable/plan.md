

# Real-Time Clickable Jargon Detection

## Overview
Add AI-powered real-time jargon detection during recording. Words identified as difficult/jargon will be highlighted and tappable - clicking them instantly shows the meaning and lets you save for later review.

---

## How It Works

1. As transcript appears during recording, each word is analyzed
2. Difficult words get highlighted (colored/underlined)
3. Tap any highlighted word to see instant explanation in a popup
4. Save button in popup adds term to your library for later review

---

## Technical Approach

### New Edge Function: `explain-word`
A lightweight function that:
- Takes a single word/phrase plus surrounding context
- Uses AI (Gemini Flash) to determine if it's jargon and explain it
- Returns: `{ isJargon: boolean, explanation: string }`

### Real-Time Detection Strategy
Two options considered:

| Approach | Pros | Cons |
|----------|------|------|
| Batch analysis every few seconds | Fewer API calls | Slight delay |
| On-demand (tap any word) | No wasted calls, instant UX | User must guess what's jargon |

**Recommended: Hybrid approach**
- Batch-analyze transcript every 5 seconds to highlight jargon words
- Tapping ANY word (jargon or not) triggers instant explanation

### UI Changes to Recording Page

1. **Clickable Transcript Component**
   - Split transcript into individual words
   - Words identified as jargon get highlighted styling
   - Each word is tappable

2. **Word Detail Dialog/Tooltip**
   - Shows on word tap
   - Displays: word, explanation, "Save to Library" button
   - Loading state while fetching explanation

3. **Instant Save Flow**
   - Creates jargon_term without a moment_id (standalone term)
   - Adds to saved_terms immediately

---

## Database Changes

Modify `jargon_terms` table:
- Make `moment_id` nullable (terms can exist without a captured moment)

This allows saving individual words during recording without creating a full "moment."

---

## Implementation Steps

1. **Database Migration**
   - Alter `jargon_terms.moment_id` to be nullable

2. **Create `explain-word` Edge Function**
   - Fast, single-word explanation endpoint
   - Uses surrounding context for accuracy

3. **Create `detect-jargon-batch` Edge Function**
   - Analyzes transcript chunk, returns list of jargon words
   - Called every 5 seconds during recording

4. **Build `ClickableTranscript` Component**
   - Renders words as tappable spans
   - Highlights detected jargon words
   - Handles tap to show explanation dialog

5. **Build `WordExplanationDialog` Component**
   - Shows word explanation
   - Save to library button
   - Loading/error states

6. **Update Recording Page**
   - Replace plain transcript with ClickableTranscript
   - Add periodic jargon detection
   - Integrate dialog for word taps

7. **Update Library Page**
   - Show standalone saved terms (no moment attached)

---

## User Flow

```text
User starts recording
    |
    v
Transcript appears as words (tappable)
    |
    v
Every 5s: AI scans for jargon -> highlights found words
    |
    v
User taps any word
    |
    v
Dialog shows explanation (AI fetches if not cached)
    |
    v
User taps "Save" -> term added to library
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/explain-word/index.ts` | Create |
| `supabase/functions/detect-jargon-batch/index.ts` | Create |
| `src/components/recording/ClickableTranscript.tsx` | Create |
| `src/components/recording/WordExplanationDialog.tsx` | Create |
| `src/pages/Recording.tsx` | Modify |
| `src/hooks/useJargonDetection.ts` | Create |
| `src/pages/Library.tsx` | Modify |
| Database migration | Create |

