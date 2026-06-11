import archiver from 'archiver';
import { Writable } from 'node:stream';

export interface ZipEntry {
  name: string;
  buffer: Buffer;
}

export function buildZip(entries: ZipEntry[]): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        chunks.push(chunk);
        cb();
      },
    });
    sink.on('finish', () => resolve(Buffer.concat(chunks)));
    sink.on('error', (e: Error) => reject(e));

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (e: Error) => reject(e));
    archive.pipe(sink);
    for (const e of entries) {
      archive.append(e.buffer, { name: e.name });
    }
    void archive.finalize();
  });
}
