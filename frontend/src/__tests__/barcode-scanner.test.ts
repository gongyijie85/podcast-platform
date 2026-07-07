import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const decodeFromImageUrlMock = vi.hoisted(() => vi.fn());
const decodeFromConstraintsMock = vi.hoisted(() => vi.fn());

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatOneDReader: vi.fn().mockImplementation(() => ({
    decodeFromImageUrl: decodeFromImageUrlMock,
    decodeFromConstraints: decodeFromConstraintsMock,
  })),
}));

import {
  normalizeIsbnBarcode,
  scanIsbnFromImage,
  startIsbnVideoScan,
} from '@/utils/barcode-scanner';

describe('scanIsbnFromImage', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob://mock'),
      revokeObjectURL: vi.fn(),
    });
    decodeFromImageUrlMock.mockReset();
    decodeFromConstraintsMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns normalized ISBN-13 when EAN-13 barcode is detected', async () => {
    decodeFromImageUrlMock.mockResolvedValue({ getText: () => '978-0-13-595705-9' });
    const result = await scanIsbnFromImage(new File(['x'], 'cover.jpg', { type: 'image/jpeg' }));
    expect(result).toBe('9780135957059');
  });

  it('returns normalized ISBN-10 when barcode is detected', async () => {
    decodeFromImageUrlMock.mockResolvedValue({ getText: () => '0-13-595705-2' });
    const result = await scanIsbnFromImage(new File(['x'], 'cover.jpg', { type: 'image/jpeg' }));
    expect(result).toBe('0135957052');
  });

  it('returns null when barcode text is not a valid ISBN', async () => {
    decodeFromImageUrlMock.mockResolvedValue({ getText: () => '12345' });
    const result = await scanIsbnFromImage(new File(['x'], 'cover.jpg', { type: 'image/jpeg' }));
    expect(result).toBeNull();
  });

  it('returns null when barcode reader throws', async () => {
    decodeFromImageUrlMock.mockRejectedValue(new Error('not found'));
    const result = await scanIsbnFromImage(new File(['x'], 'cover.jpg', { type: 'image/jpeg' }));
    expect(result).toBeNull();
  });

  it('revokes object URL after decoding', async () => {
    decodeFromImageUrlMock.mockResolvedValue({ getText: () => '9780135957059' });
    await scanIsbnFromImage(new File(['x'], 'cover.jpg', { type: 'image/jpeg' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob://mock');
  });

  it('normalizes valid ISBN barcodes and rejects other values', () => {
    expect(normalizeIsbnBarcode('978-0-13-595705-9')).toBe('9780135957059');
    expect(normalizeIsbnBarcode('0-13-595705-2')).toBe('0135957052');
    expect(normalizeIsbnBarcode('12345')).toBeNull();
  });

  it('scans the environment camera and reports valid ISBN values', async () => {
    let callback: ((result?: { getText: () => string }) => void) | undefined;
    const controls = { stop: vi.fn() };
    decodeFromConstraintsMock.mockImplementationOnce(
      (
        _constraints: MediaStreamConstraints,
        _video: HTMLVideoElement,
        onResult: typeof callback,
      ) => {
        callback = onResult;
        return Promise.resolve(controls);
      },
    );
    const video = document.createElement('video');
    const onDetected = vi.fn();

    await expect(startIsbnVideoScan(video, onDetected)).resolves.toBe(controls);
    expect(decodeFromConstraintsMock).toHaveBeenCalledWith(
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
      video,
      expect.any(Function),
    );

    callback?.({ getText: () => 'not-an-isbn' });
    callback?.({ getText: () => '978-0-13-595705-9' });
    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected).toHaveBeenCalledWith('9780135957059');
  });
});
