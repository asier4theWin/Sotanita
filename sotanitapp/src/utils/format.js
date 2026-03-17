export const formatLikes = (value) => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return String(value);
};

export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
