'use strict';

/**
 * Engagement rate = (avg likes + avg comments) / followers.
 * Returned as a fraction (0.043 = 4.3%). Returns 0 when there's no signal
 * (no posts or no followers) instead of dividing by zero.
 */
function calculateEngagementRate({ posts, followers }) {
  if (!followers || !posts?.length) return 0;

  const totalLikes = posts.reduce((sum, p) => sum + (p.likes || 0), 0);
  const totalComments = posts.reduce((sum, p) => sum + (p.comments || 0), 0);
  const avgLikes = totalLikes / posts.length;
  const avgComments = totalComments / posts.length;

  return (avgLikes + avgComments) / followers;
}

/**
 * Posting frequency in posts-per-week, derived from the timestamp spread of
 * the supplied posts. Falls back to 0 when fewer than 2 dated posts exist.
 */
function calculatePostingFrequency(posts) {
  const dated = (posts || [])
    .map((p) => (p.postedAt ? new Date(p.postedAt) : null))
    .filter(Boolean)
    .sort((a, b) => b - a);

  if (dated.length < 2) return 0;

  const spanMs = dated[0] - dated[dated.length - 1];
  const spanWeeks = spanMs / (1000 * 60 * 60 * 24 * 7);
  if (spanWeeks <= 0) return 0;

  return dated.length / spanWeeks;
}

function calculateAverages(posts) {
  if (!posts?.length) return { avgLikes: 0, avgComments: 0 };
  const totalLikes = posts.reduce((sum, p) => sum + (p.likes || 0), 0);
  const totalComments = posts.reduce((sum, p) => sum + (p.comments || 0), 0);
  return {
    avgLikes: totalLikes / posts.length,
    avgComments: totalComments / posts.length,
  };
}

module.exports = {
  calculateEngagementRate,
  calculatePostingFrequency,
  calculateAverages,
};
