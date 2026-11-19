const arrivalVideo = document.querySelector('.arrival-video');
const arrivalControls = document.querySelector('.arrival-controls');
const soundButton = arrivalControls.querySelector('[data-arrival-sound]');
const playButton = arrivalControls.querySelector('[data-arrival-play]');

function updateControls() {
  soundButton.textContent = arrivalVideo.muted || arrivalVideo.paused
    ? 'Play with sound'
    : 'Mute video';
  playButton.textContent = arrivalVideo.paused ? 'Play video' : 'Pause video';
}

for (const event of ['play', 'pause', 'volumechange']) {
  arrivalVideo.addEventListener(event, updateControls);
}

soundButton.addEventListener('click', async () => {
  if (!arrivalVideo.paused && !arrivalVideo.muted) {
    arrivalVideo.muted = true;
    return;
  }

  arrivalVideo.muted = false;
  try {
    await arrivalVideo.play();
  } catch {
    updateControls();
  }
});

playButton.addEventListener('click', async () => {
  if (!arrivalVideo.paused) {
    arrivalVideo.pause();
    return;
  }

  try {
    await arrivalVideo.play();
  } catch {
    updateControls();
  }
});

async function startArrivalVideo() {
  arrivalControls.hidden = false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  try {
    await arrivalVideo.play();
  } catch {
    arrivalVideo.muted = true;
    try {
      await arrivalVideo.play();
    } catch {
      updateControls();
    }
  }
  updateControls();
}

startArrivalVideo();
