"use client";
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { getFirebaseMessagingToken } from '@/lib/utils/firebaseMessaging';

export function PushNotifications() {
  const { user } = useAuth();
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  useEffect(() => {
    if (!user || !('serviceWorker' in navigator)) return;
    const renew = () => { if ('Notification' in window && Notification.permission === 'granted') void getFirebaseMessagingToken().catch(() => {}); };
    const receive = (event: MessageEvent) => { if (event.data?.type === 'littersense-push') setNotice({ title: String(event.data.title), body: String(event.data.body) }); };
    renew(); window.addEventListener('focus', renew); navigator.serviceWorker.addEventListener('message', receive);
    return () => { window.removeEventListener('focus', renew); navigator.serviceWorker.removeEventListener('message', receive); };
  }, [user]);
  if (!notice) return null;
  return <div role="status" className="fixed bottom-24 right-4 z-50 max-w-sm rounded-2xl border border-litter-border bg-litter-card p-4 text-theme-text shadow-lg"><strong>{notice.title}</strong><p className="mt-2 text-sm">{notice.body}</p><button className="mt-3 text-litter-primary" onClick={() => setNotice(null)}>Dismiss</button></div>;
}

export function PushNotificationSettings() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [iphoneHint, setIphoneHint] = useState(false);
  const [registeredOwner, setRegisteredOwner] = useState<string | null>(null);
  const enabled = Boolean(user && registeredOwner === user.uid);
  useEffect(() => { setIphoneHint(/iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches); }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const check = async () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        if (active) setRegisteredOwner(null);
        return;
      }
      try {
        const token = await getFirebaseMessagingToken();
        if (active) setRegisteredOwner(token ? user.uid : null);
      } catch (error) {
        if (active) {
          setRegisteredOwner(null);
          setStatus(error instanceof Error ? error.message : 'Unable to verify push registration. Try enabling notifications again.');
        }
      }
    };
    void check();
    window.addEventListener('focus', check);
    return () => { active = false; window.removeEventListener('focus', check); };
  }, [user]);
  const enable = async () => {
    if (!user) return;
    setBusy(true);
    try {
      if (!('Notification' in window)) throw new Error('Push is unavailable in this browser.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Allow notifications in your browser settings, then try again.');
      const token = await getFirebaseMessagingToken();
      if (!token) throw new Error('Push is unavailable in this browser.');
      setRegisteredOwner(user.uid);
      setStatus('');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to enable push.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="border-t border-litter-border p-4">
      <p className="text-sm font-medium text-theme-text">Push notifications on this device</p>
      <p className="mt-1 text-sm text-theme-muted">Receive alerts when LitterSense is closed. Your alert preferences and quiet hours apply.</p>
      {iphoneHint && <p className="mt-2 text-sm text-theme-muted">iPhone requires iOS 16.4 or later. Add LitterSense to your Home Screen, open it there, then enable notifications.</p>}
      {enabled ? <p className="mt-3 text-sm text-litter-primary">Notifications enabled on this device</p> : <button disabled={busy || !user} onClick={enable} className="mt-3 rounded-xl bg-litter-primary px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Please wait...' : 'Enable push notifications'}</button>}
      {status && <p role="status" className="mt-2 text-sm text-theme-muted">{status}</p>}
    </div>
  );
}
