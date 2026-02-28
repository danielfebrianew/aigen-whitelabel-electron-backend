# Frontend Changes — Gemini TTS → ElevenLabs TTS Migration

## What Changed in the Backend

- TTS provider switched from **Google Gemini** to **ElevenLabs** (via Kie.ai API)
- Voice names changed internally, but the API contract is **unchanged**
- `voiceGender` still accepts `'male'` or `'female'` — the backend randomly picks a voice

## What to Adjust in the Frontend

### 1. Voice Gender Selector (UI)

The frontend should display **only two options**: `Male` and `Female`.

No individual voice names should be exposed — the backend handles randomization.

```
voiceGender: 'male' | 'female'
```

If you previously displayed Gemini voice names (Achernar, Zephyr, Alnilam, etc.), **remove them**. Replace with a simple gender toggle/dropdown.

### 2. API Request Body — No Changes Needed

The `POST /generate/video` payload stays the same:

```json
{
  "images": ["https://..."],
  "productName": "My Product",
  "prompts": ["prompt1", "prompt2", "prompt3", "prompt4"],
  "script": "Voiceover text here...",
  "jobId": "uuid-here",
  "targetCount": 1,
  "voiceGender": "female"
}
```

### 3. Remove Any Gemini-Specific References

- Remove any UI labels mentioning "Gemini TTS" or "Google TTS"
- If there are voice preview/sample features tied to Gemini voices, remove or update them
- No new API keys or environment variables are needed on the frontend side

### 4. Audio Format Change

- Output audio changed from `.wav` to `.mp3`
- This should **not** affect the frontend since the final output is still an `.mp4` video (audio is merged server-side)
- If you have any logic that references `.wav` temp files, update to `.mp3`

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| TTS Provider | Google Gemini | ElevenLabs (via Kie.ai) |
| Voice options shown to user | Could show voice names | Only `Male` / `Female` |
| API field | `voiceGender: 'male' \| 'female'` | Same — no change |
| Default gender | `female` | Same — no change |
| Final video format | `.mp4` | Same — no change |
