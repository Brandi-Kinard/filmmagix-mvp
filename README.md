# FilmMagix MVP - AI-Powered Memory Films

A rapid MVP that merges AI short-film generation, one-click faceless videos, and memory archiving into a single powerful platform.

## Features

- **AI Storyboard Generation** - Transform text prompts into structured shot lists
- **Visual Style Selection** - Choose from cinematic, anime, documentary, noir, retro, or minimalist styles
- **Automated Narration** - AI-generated voice narration for each scene
- **Video Assembly** - Automatic compilation of shots into complete videos
- **Memory Archive** - Store and replay generated films
- **Real-time Progress** - Visual feedback during generation

## Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Set up API keys (optional):**
```bash
cp .env.example .env
# Edit .env and add your OpenAI API key
```

3. **Run the development server:**
```bash
npm run dev
```

4. **Open in browser:**
Navigate to `http://localhost:5173`

## How to Use

1. **Enter a Story Prompt** - Describe your story idea, memory, or concept
2. **Choose Visual Style** - Select from 6 different aesthetic styles
3. **Set Duration** - Pick 15, 30, or 60 seconds
4. **Select Voice** - Choose male, female, or neutral narration
5. **Click Generate** - Watch as AI creates your film in real-time
6. **View & Download** - Preview your film and save it locally

## API Integration

The app works in two modes:

### With API Keys (Full Features)
- Add your OpenAI API key to `.env`
- Enables GPT-3.5 for storyboard generation
- Enables DALL-E for image generation
- Real AI-powered content creation

### Without API Keys (Demo Mode)
- Uses mock data and placeholders
- Perfect for testing the UI/UX
- No external dependencies

## Technology Stack

- **Frontend:** Vite + React + TypeScript
- **State Management:** Zustand
- **Styling:** CSS with modern gradients
- **Animations:** Framer Motion
- **Icons:** Lucide React

## Project Structure

```
src/
├── components/
│   ├── InputPanel.tsx    # User input controls
│   ├── PreviewArea.tsx   # Video preview & progress
│   └── Archive.tsx       # Film gallery
├── services/
│   └── ai.ts            # AI service integration
├── store.ts             # Global state management
├── types.ts             # TypeScript definitions
└── App.tsx              # Main application
```

## Deployment

### Deploy to Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Deploy to Netlify

1. Build the project: `npm run build`
2. Deploy the `dist` folder
3. Add environment variables in Netlify dashboard

## Future Enhancements

- Real video generation with Replicate/RunwayML
- Advanced voice synthesis
- Multi-language support
- Social sharing features
- Collaborative story creation
- Premium templates
- Background music library

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.