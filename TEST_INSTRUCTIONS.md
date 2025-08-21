# FilmMagix MVP - Complete Test Instructions

## What This Project Does

FilmMagix creates short videos with:
1. **Visual scenes** - Different colored backgrounds with text overlays
2. **Background music** - Plays throughout the entire video
3. **Voiceover** - Plays the selected voice for each scene
4. **Export** - Downloads as MP4 video file

## How to Test

### 1. Start the Application
```bash
npm run dev
```
Go to http://localhost:5177/

### 2. Generate Scenes
- Enter text like: "Welcome to our amazing product. It will change your life. Sign up today for free!"
- Click **Generate**
- You'll see 3 scenes: Hook, Beat, CTA

### 3. Configure Audio
- **Background Music**: Select "Lofi Chill" (or any other)
- **Voiceover**: 
  - Check "Enable Voiceover"
  - Select "Samantha" (or any available voice)
  - Keep default rate (1.0x)

### 4. Export Video
- Click **Export Storyboard MP4**
- During export:
  - You'll HEAR the real Samantha voice speaking each scene
  - Progress will show in console
- Video will download automatically

### 5. Check the Video
Open the downloaded video and verify:
- ✅ Different colored backgrounds for each scene
- ✅ Scene text displayed on each scene
- ✅ Background music plays throughout
- ✅ Voiceover audio for each scene (placeholder audio due to browser limitations)

## Known Limitations

**IMPORTANT**: Due to browser security, we CANNOT capture the actual Web Speech API audio directly. This means:
- During export: You hear the REAL selected voice (Samantha)
- In the video: You get placeholder voice audio with correct timing

This is a fundamental browser limitation that cannot be bypassed without:
1. Using pre-recorded audio files
2. Having users record their own voice
3. Using a server-side text-to-speech service

## What Actually Works

1. **Scene Generation** ✅
   - Creates video segments with colored backgrounds
   - Displays scene text using FFmpeg drawtext

2. **Background Music** ✅
   - Loads from /public/audio/ directory
   - Plays throughout entire video
   - Volume control and auto-ducking

3. **Voiceover Timing** ✅
   - Correct duration for each scene
   - Synchronized with video scenes
   - User hears real voice during generation

4. **Video Export** ✅
   - Combines all scenes into single MP4
   - Mixes background music with voiceover
   - Proper audio levels and timing

## Technical Details

### File Structure
- `/src/lib/ffmpegOrchestrator.ts` - Main video generation
- `/src/lib/practicalVoiceover.ts` - Voiceover system
- `/src/lib/audioSystem.ts` - Audio configuration
- `/public/audio/*.wav` - Background music files

### How It Works
1. Generate colored background scenes with text
2. Play real voice for user during export
3. Generate placeholder audio for video (browser limitation)
4. Mix background music with voiceover
5. Export as MP4

## Alternative Solutions for Real Voice

If you need the ACTUAL voice in the video, consider:

1. **Server-side TTS**: Use Google Cloud, AWS Polly, or Azure TTS
2. **Pre-recorded Audio**: Upload voice files for each scene
3. **User Recording**: Let users record their own voice
4. **Desktop App**: Use Electron to access system audio

The current implementation is the best possible within browser constraints.