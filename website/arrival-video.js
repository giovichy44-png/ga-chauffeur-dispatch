const arrivalVideo = document.querySelector('.arrival-video');
if (arrivalVideo && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  arrivalVideo.play().catch(() => {});
}
