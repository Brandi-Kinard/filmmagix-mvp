# FilmMagix Audio Assets

This directory contains royalty-free background music and sound effects for the video export system.

## Required Audio Files

### Background Music Tracks
- `lofi-1.wav` - Relaxed lofi hip-hop for chill scenes
- `cinematic-1.wav` - Epic orchestral for dramatic scenes  
- `tension-1.wav` - Suspenseful ambient for mystery/thriller
- `uplift-1.wav` - Upbeat motivational for positive endings

### Sound Effects  
- `whoosh-1.wav` - Subtle transition whoosh sound (~250ms)

## Supported Formats

The audio system supports WAV files (.wav) which are processed by FFmpeg.

## Audio Processing

The system automatically:
- Normalizes volume to ~-14 LUFS equivalent based on slider setting
- Adds 0.3s fade-in and 0.6s fade-out to background music
- Optionally overlays whoosh SFX at scene transitions (when enabled)
- Maintains client-side processing with FFmpeg
- Falls back to video-only if audio files are missing

## File Placement

Place your `.wav` files directly in this `/public/audio/` directory with the exact filenames listed above.

## Licensing

All audio files should be royalty-free or public domain.