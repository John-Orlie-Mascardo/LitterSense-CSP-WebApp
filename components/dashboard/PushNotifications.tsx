"use client";
import { useEffect, useRef, useState } from 'react';
import { Toggle } from '@/components/ui/Toggle';
import { useAuth } from '@/lib/contexts/AuthContext';
import { getFirebaseMessagingToken, getFirebaseMessagingRegistrationOwner, unregisterFirebaseMessagingToken, devicePushDisabled, setDevicePushDisabled } from '@/lib/utils/firebaseMessaging';

export function PushNotifications() {
  const { user } = useAuth();
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  useEffect(() => {
    if (!user || !('serviceWorker' in navigator)) return;
    const renew = () => { if ('Notification' in window && Notification.permission === 'granted') void getFirebaseMessagingToken().catch(() => { setNotice({ title: 'Notifications need attention', body: 'Open Settings and turn push notifications off and on for this device.' }); }); };
    const receive = (event: MessageEvent) => { if (event.data?.type === 'littersense-push') setNotice({ title: String(event.data.title), body: String(event.data.body) }); };
    renew(); window.addEventListener('focus', renew); window.addEventListener('online', renew); navigator.serviceWorker.addEventListener('message', receive);
    return () => { window.removeEventListener('focus', renew); window.removeEventListener('online', renew); navigator.serviceWorker.removeEventListener('message', receive); };
  }, [user]);
  if (!notice) return null;
  return <div role="status" className="fixed bottom-24 right-4 z-50 max-w-sm rounded-2xl border border-litter-border bg-litter-card p-4 text-theme-text shadow-lg"><strong>{notice.title}</strong><p className="mt-2 text-sm">{notice.body}</p><button className="mt-3 text-litter-primary" onClick={() => setNotice(null)}>Dismiss</button></div>;
}

export function PushNotificationSettings() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [iphoneHint, setIphoneHint] = useState(false);
  const [registeredOwner, setRegisteredOwner] = useState<string | null>(getFirebaseMessagingRegistrationOwner);
  const [checking, setChecking] = useState(true);
  const [checkedOwner, setCheckedOwner] = useState<string | null>(null);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const owner = useRef<string | null>(user?.uid ?? null);
  const request = useRef(0);
  const mutating = useRef(false);
  const uid = user?.uid ?? null;
  const enabled = Boolean(user && registeredOwner === user.uid);
  const waiting = Boolean(user && !enabled && (checking || checkedOwner !== user.uid));
  const isCurrent = (id: number, expectedOwner: string) => request.current === id && owner.current === expectedOwner;
  useEffect(() => { setIphoneHint(/iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches); }, []);
  useEffect(() => {
    owner.current = uid;
    mutating.current = false;
    setBusy(false);
    setStatus('');
    setVerificationFailed(false);
    let active = true;
    const check = async () => {
      if (mutating.current) return;
      const id = ++request.current;
      const cachedOwner = getFirebaseMessagingRegistrationOwner();
      setRegisteredOwner(cachedOwner === uid ? cachedOwner : null);
      if (!uid || devicePushDisabled() || !('Notification' in window) || Notification.permission !== 'granted') {
        setRegisteredOwner(null);
        setCheckedOwner(uid);
        setChecking(false);
        return;
      }
      setChecking(cachedOwner !== uid);
      try {
        const token = await getFirebaseMessagingToken(uid);
        if (active && isCurrent(id, uid)) {
          setRegisteredOwner(token && !devicePushDisabled() && Notification.permission === 'granted' ? uid : null);
          setVerificationFailed(false);
          setStatus('');
        }
      } catch (error) {
        if (active && isCurrent(id, uid)) {
          setVerificationFailed(true);
          setStatus(error instanceof Error ? error.message : 'Unable to verify push registration. Try enabling notifications again.');
        }
      } finally {
        if (active && isCurrent(id, uid)) {
          setCheckedOwner(uid);
          setChecking(false);
        }
      }
    };
    void check();
    window.addEventListener('focus', check);
    return () => { active = false; owner.current = null; window.removeEventListener('focus', check); };
  }, [uid]);
  const enable = async () => {
    if (!user || mutating.current) return;
    const expectedOwner = user.uid;
    const id = ++request.current;
    mutating.current = true;
    setChecking(false);
    setCheckedOwner(expectedOwner);
    let restorePreference: (() => void) | undefined;
    setBusy(true);
    try {
      if (!('Notification' in window)) throw new Error('Push is unavailable in this browser.');
      const permission = await Notification.requestPermission();
      if (!isCurrent(id, expectedOwner)) return;
      if (permission !== 'granted') throw new Error('Allow notifications in your browser settings, then try again.');
      restorePreference = setDevicePushDisabled(false);
      const token = await getFirebaseMessagingToken(expectedOwner);
      if (!isCurrent(id, expectedOwner)) return;
      if (!token) throw new Error('Push is unavailable in this browser.');
      if (Notification.permission !== 'granted') throw new Error('Allow notifications in your browser settings, then try again.');
      setRegisteredOwner(expectedOwner);
      setVerificationFailed(false);
      setStatus('');
    } catch (error) {
      restorePreference?.();
      if (isCurrent(id, expectedOwner)) setStatus(error instanceof Error ? error.message : 'Unable to enable push.');
    } finally {
      if (isCurrent(id, expectedOwner)) { mutating.current = false; setBusy(false); }
    }
  };
  const disable = async () => {
    if (!user || mutating.current) return;
    const expectedOwner = user.uid;
    const id = ++request.current;
    mutating.current = true;
    setChecking(false);
    setCheckedOwner(expectedOwner);
    let restorePreference: (() => void) | undefined;
    setBusy(true);
    try {
      restorePreference = setDevicePushDisabled(true);
      await unregisterFirebaseMessagingToken(expectedOwner);
      if (!isCurrent(id, expectedOwner)) return;
      setRegisteredOwner(null);
      setVerificationFailed(false);
      setStatus('');
    } catch (error) {
      restorePreference?.();
      if (isCurrent(id, expectedOwner)) {
        setStatus(error instanceof Error ? error.message : 'Unable to disable push. Try again.');
      }
    } finally {
      if (isCurrent(id, expectedOwner)) { mutating.current = false; setBusy(false); }
    }
  };
  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-4"><p id="device-push-label" className="min-w-0 flex-1 text-sm font-medium text-theme-text">Push notifications on this device</p><div role="group" aria-labelledby="device-push-label" aria-busy={waiting} className="shrink-0">{waiting ? <span aria-hidden="true" className="block h-[30px] w-[60px] animate-pulse rounded-full bg-litter-input" /> : <Toggle ariaLabel="Push notifications on this device" checked={enabled} disabled={busy || !user} onChange={value => { void (value ? enable() : disable()); }} />}</div></div>
      <p className="mt-1 text-sm text-theme-muted">Receive alerts when LitterSense is closed. Your alert preferences and quiet hours apply.</p>
      {iphoneHint && <p className="mt-2 text-sm text-theme-muted">iPhone requires iOS 16.4 or later. Add LitterSense to your Home Screen, open it there, then enable notifications.</p>}
      <p role="status" className="mt-3 text-sm text-theme-muted">{busy ? 'Updating notifications...' : waiting ? 'Checking notification status...' : verificationFailed && !enabled ? 'Unable to verify notifications on this device' : enabled ? 'Notifications enabled on this device' : 'Notifications off on this device'}</p>
      {status && <p role="status" className="mt-2 text-sm text-theme-muted">{status}</p>}
    </div>
  );
}
