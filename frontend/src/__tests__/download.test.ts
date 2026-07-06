import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { triggerDownload, downloadFromUrl } from '../utils/download';

describe('triggerDownload', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;
  let createdUrls: string[] = [];
  let revokedUrls: string[] = [];

  // The source code's `triggerDownload` schedules a 100 ms `setTimeout` to
  // remove the temporary anchor and revoke the object URL. If the test
  // finishes (or `afterEach` clears `document.body`) before that timer
  // fires, jsdom throws `NotFoundError: The node to be removed is not a
  // child of this node.` — surfaced by vitest as an unhandled error that
  // fails the run with "ELIFECYCLE Test failed" even though every
  // assertion passed.
  //
  // We drain the pending timers in `afterEach` so the deferred DOM
  // mutation always happens before the next test starts.
  const drainTimers = async () => {
    // Wait for the 100 ms cleanup timer inside `triggerDownload` (plus a
    // small safety margin) before tearing down the DOM. The longest
    // timeout the source code schedules is 100 ms.
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
  };

  beforeEach(() => {
    createdUrls = [];
    revokedUrls = [];
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((_blob: Blob | MediaSource) => {
      const url = `blob:test/${createdUrls.length}`;
      createdUrls.push(url);
      return url;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn((url: string) => {
      revokedUrls.push(url);
    }) as typeof URL.revokeObjectURL;
  });

  afterEach(async () => {
    await drainTimers();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    document.body.innerHTML = '';
  });

  it('triggers a click on a temporary anchor for a Blob', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    triggerDownload(new Blob(['hello'], { type: 'text/plain' }), 'greeting.txt');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // URL should be revoked after the timeout
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(revokedUrls).toHaveLength(1);
        resolve();
      }, 150);
    });
  });

  it('does NOT call createObjectURL for a string input (data URL or URL)', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    triggerDownload('https://example.com/file.txt', 'greeting.txt');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createdUrls).toHaveLength(0);
    expect(revokedUrls).toHaveLength(0);
  });

  it('sets the download attribute to the supplied filename', () => {
    const blob = new Blob(['x']);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    let captured: HTMLAnchorElement | null = null;
    const origCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        captured = el as HTMLAnchorElement;
      }
      return el;
    });
    triggerDownload(blob, 'audio.mp3');
    expect(captured).not.toBeNull();
    expect(captured!.download).toBe('audio.mp3');
    expect(captured!.href).toBe('blob:test/0');
    createSpy.mockRestore();
    clickSpy.mockRestore();
  });
});

describe('downloadFromUrl', () => {
  afterEach(async () => {
    // `downloadFromUrl` also schedules a 100 ms `setTimeout` to remove the
    // anchor. Wait for it to fire so the DOM cleanup below doesn't race
    // with the deferred `removeChild` and trip jsdom's NotFoundError.
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    document.body.innerHTML = '';
  });

  it('sets anchor href to the URL and clicks it', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    let captured: HTMLAnchorElement | null = null;
    const origCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'a') captured = el as HTMLAnchorElement;
      return el;
    });
    downloadFromUrl('https://cdn.example.com/file.zip', 'file.zip');
    expect(captured).not.toBeNull();
    expect(captured!.href).toBe('https://cdn.example.com/file.zip');
    expect(captured!.download).toBe('file.zip');
    expect(captured!.target).toBe('_blank');
    expect(captured!.rel).toBe('noopener');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    createSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it('works without a filename', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    downloadFromUrl('https://example.com/x');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
