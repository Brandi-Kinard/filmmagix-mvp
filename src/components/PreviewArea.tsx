import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Download, Archive, Loader2 } from 'lucide-react';
import { useStore } from '../store';

export const PreviewArea: React.FC = () => {
  const { currentFilm, isGenerating, generationStep } = useStore();
  
  if (!currentFilm && !isGenerating) {
    return (
      <div className="preview-area">
        <div className="empty-state">
          <Archive className="empty-icon" />
          <h3>No Film Selected</h3>
          <p>Enter a prompt and click "Generate Film" to begin</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="preview-area">
      <AnimatePresence mode="wait">
        {isGenerating ? (
          <motion.div
            key="generating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="generation-status"
          >
            <Loader2 className="spinner" />
            <h3>{generationStep}</h3>
            <div className="progress-bar">
              <motion.div
                className="progress-fill"
                initial={{ width: 0 }}
                animate={{ width: `${currentFilm?.progress || 0}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <p className="progress-text">{currentFilm?.progress || 0}% Complete</p>
          </motion.div>
        ) : currentFilm?.status === 'complete' ? (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="video-preview"
          >
            <div className="video-container">
              <div className="video-placeholder">
                <Play className="play-icon" />
                <p>Video Preview</p>
              </div>
            </div>
            
            <div className="film-details">
              <h3>{currentFilm.title}</h3>
              <div className="storyboard-preview">
                <h4>Storyboard</h4>
                <div className="shots-list">
                  {currentFilm.storyboard.shots.map((shot, index) => (
                    <div key={shot.id} className="shot-item">
                      <span className="shot-number">{index + 1}</span>
                      <div className="shot-content">
                        <p className="shot-description">{shot.description}</p>
                        <p className="shot-narration">"{shot.narration}"</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="action-buttons">
                <button className="btn-secondary">
                  <Play className="icon-sm" />
                  Play
                </button>
                <button className="btn-primary">
                  <Download className="icon-sm" />
                  Download
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};