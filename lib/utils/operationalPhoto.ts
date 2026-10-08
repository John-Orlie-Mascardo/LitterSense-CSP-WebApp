import { auth } from '@/lib/configs/firebase';
export async function primaryPhoto(path: string, blob?: Blob, options: { onProgress?: (percent: number | null) => void; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first');
  options.signal?.throwIfAborted();
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid) throw new Error('Account changed');
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => { xhr.abort(); reject(options.signal?.reason ?? new DOMException('Upload canceled', 'AbortError')); };
    const finish = () => options.signal?.removeEventListener('abort', abort);
    xhr.open('POST', '/api/operational/media'); xhr.timeout = options.timeoutMs ?? 45000;
    xhr.setRequestHeader('Authorization', `Bearer ${token}`); xhr.setRequestHeader('x-photo-path', path);
    if (blob) xhr.setRequestHeader('Content-Type', blob.type || 'image/jpeg'); else xhr.setRequestHeader('x-photo-action', 'delete');
    xhr.upload.onprogress = e => options.onProgress?.(e.lengthComputable ? Math.round(e.loaded / e.total * 100) : null);
    xhr.onload = () => { finish(); try { const data = JSON.parse(xhr.responseText); if (xhr.status >= 300 || auth.currentUser?.uid !== user.uid) throw new Error(data.error ?? 'Account changed'); resolve(data.url ?? ''); } catch (error) { reject(error); } };
    xhr.onerror = () => { finish(); reject(new Error('Photo storage unavailable')); };
    xhr.ontimeout = () => { finish(); reject(new Error('The photo upload took too long. Please try again.')); };
    xhr.onabort = () => { finish(); reject(new DOMException('Upload canceled', 'AbortError')); };
    options.signal?.addEventListener('abort', abort, { once: true });
    options.onProgress?.(null); if (options.signal?.aborted) abort(); else xhr.send(blob ?? null);
  });
}
