window.GAPhonePush = {
  async enable(button, getKey, save, show, scope = '/') {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      show('On iPhone, add this app to the Home Screen in Safari and open it there first.');
      return;
    }
    button.disabled = true;
    try {
      if (await Notification.requestPermission() !== 'granted') {
        throw Error('Allow notifications for this app in iPhone Settings.');
      }
      const response = await getKey();
      const config = await response.json();
      if (!response.ok) throw Error(config.error || 'Phone notifications are unavailable.');
      const registration = await navigator.serviceWorker.register('/sw.js', {scope});
      if (!registration.active) {
        const worker = registration.installing || registration.waiting;
        if (!worker) throw Error('Phone notifications did not start. Please try again.');
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(Error('Phone notifications did not start. Please try again.')), 10000);
          function activated() {
            if (worker.state === 'activated') { clearTimeout(timeout); resolve(); }
          }
          worker.addEventListener('statechange', activated);
          activated();
        });
      }
      const encoded = config.key.replace(/-/g, '+').replace(/_/g, '/');
      const key = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
      let subscription = await registration.pushManager.getSubscription();
      const previous = subscription?.options.applicationServerKey;
      if (previous && new Uint8Array(previous).some((byte, index) => byte !== key[index])) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ||= await registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:key});
      const saved = await save(subscription);
      if (!saved.ok) throw Error('Could not save phone notifications. Please try again.');
      button.textContent = 'Phone notifications enabled';
      show('Phone notifications enabled on this device.');
    } catch (error) {
      show(error.message);
    } finally {
      button.disabled = false;
    }
  }
};
