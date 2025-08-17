import React from 'react';
import { Calendar, Play, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import type { Film } from '../types';

export const Archive: React.FC = () => {
  const { films } = useStore();
  
  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  if (films.length === 0) {
    return null;
  }
  
  return (
    <div className="archive-section">
      <div className="archive-header">
        <h3>Your Films</h3>
        <span className="film-count">{films.length} films</span>
      </div>
      
      <div className="films-grid">
        {films.map((film: Film) => (
          <div key={film.id} className="film-card">
            <div className="film-thumbnail">
              <Play className="thumbnail-icon" />
            </div>
            <div className="film-info">
              <h4>{film.title}</h4>
              <div className="film-meta">
                <Calendar className="icon-xs" />
                <span>{formatDate(film.createdAt)}</span>
              </div>
              <div className="film-actions">
                <button className="btn-icon" title="Play">
                  <Play className="icon-sm" />
                </button>
                <button className="btn-icon" title="Delete">
                  <Trash2 className="icon-sm" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};