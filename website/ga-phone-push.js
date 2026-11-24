const gaPushRestores = new WeakMap();
window.GAPhonePush = {
  restore(button, getKey, save, show, scope, identity = scope) {
    if (!button || window.Notification?.permission !== 'granted') return;
    const attempt = gaPushRestores.get(button);
    if (attempt?.identity === identity && Date.now() - attempt.time < 300000) return;
    gaPushRestores.set(button, {identity, time:Date.now()});
    return this.enable(button, getKey, save, show, scope, false);
  },
  async enable(button, getKey, save, show, scope = '/', interactive = true) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      show('On iPhone, add this app to the Home Screen in Safari and open it there first.');
      return;
    }
    if (button.disabled) return;
    button.disabled = true;
    try {
      if (Notification.permission !== 'granted' &&
          (!interactive || await Notification.requestPermission() !== 'granted')) {
        throw Error('Allow notifications for this app in iPhone Settings.');
      }
      const response = await getKey();
      const config = await response.json();
      if (!response.ok) throw Error(config.error || 'Phone notifications are unavailable.');
      const existing = await navigator.serviceWorker.getRegistration(scope);
      const registration = existing?.scope === new URL(scope, location.origin).href
        ? existing : await navigator.serviceWorker.register('/sw.js', {scope});
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
      if (previous && (previous.byteLength !== key.length || new Uint8Array(previous).some((byte, index) => byte !== key[index]))) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ||= await registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:key});
      const saved = await save(subscription);
      if (!saved.ok) throw Error('Could not save phone notifications. Please try again.');
      button.textContent = 'Phone notifications enabled';
      if (interactive) show('Phone notifications enabled on this device.');
    } catch (error) {
      button.textContent = 'Enable phone notifications';
      if (interactive) show(error.message);
    } finally {
      button.disabled = false;
    }
  }
};
