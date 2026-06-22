import React from 'react';

interface LoaderProps {
  visible: boolean;
  title: string;
  subtitle?: string;
}

export const Loader: React.FC<LoaderProps> = ({ visible, title, subtitle }) => {
  if (!visible) return null;

  return (
    <div id="loading-overlay" className="loading-overlay">
      <div className="loader-content">
        <div className="spinner"></div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
};
