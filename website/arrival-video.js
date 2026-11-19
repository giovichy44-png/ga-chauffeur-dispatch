for (const video of document.querySelectorAll('.arrival-video')) {
  const sound = video.parentElement.querySelector('.arrival-sound');
  const update = () => {
    const label = video.muted ? 'Unmute video' : 'Mute video';
    sound.setAttribute('aria-label', label);
    sound.title = label;
    sound.textContent = video.muted ? '🔇' : '🔊';
  };

  video.addEventListener('volumechange', update);
  sound.addEventListener('click', async () => {
    video.muted = !video.muted;
    if (!video.muted && video.paused && !video.ended) {
      await video.play().catch(() => {});
    }
    update();
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    video.muted = true;
  } else {
    video.play().catch(() => {
      video.muted = true;
      return video.play();
    }).catch(() => {});
  }
  update();
  sound.hidden = false;
}
