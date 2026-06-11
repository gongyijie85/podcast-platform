import * as fs from 'node:fs';
import * as path from 'node:path';
import bookMetadata from '../src/test/fixtures/book-metadata.fixture.json';
import scriptGen from '../src/test/fixtures/script-gen.fixture.json';

/**
 * Pipeline fixture loader / shape tests (TP1).
 *
 * These tests do NOT touch NestJS. They verify the three fixture artefacts
 * are well-formed, on disk, and align with the runtime expectations of the
 * v1.1 pipeline. If any of these fail, the rest of the flow-layer suite is
 * meaningless.
 *
 * Fixture locations are resolved relative to this spec file so the tests
 * pass from both `pnpm test` and `pnpm test:e2e`.
 */

const FIXTURES_DIR = path.resolve(__dirname, '..', 'src', 'test', 'fixtures');
const SILENCE_MP3 = path.join(FIXTURES_DIR, 'silence-1s.mp3');
const BOOK_JSON = path.join(FIXTURES_DIR, 'book-metadata.fixture.json');
const SCRIPT_JSON = path.join(FIXTURES_DIR, 'script-gen.fixture.json');

interface FixtureBook {
  isbn: string;
  title: string;
  author: string;
  coverUrl: string;
  summary: string;
  source: string;
}

interface FixtureSegment {
  speaker: 'host' | 'guest';
  text: string;
  emotion: string;
}

interface FixtureStage {
  stage: 'opening' | 'intro' | 'interpret' | 'review' | 'suggest' | 'closing';
  lines: FixtureSegment[];
}

interface FixtureTemplate {
  stages: FixtureStage[];
}

interface FixtureScriptGen {
  templates: Record<string, FixtureTemplate>;
  defaultTotalChars: number;
  defaultEstimatedDurationSec: number;
}

describe('Pipeline fixtures (TP1)', () => {
  it('loads 3 books from book-metadata.fixture.json with required fields', () => {
    expect(Array.isArray(bookMetadata.books)).toBe(true);
    expect(bookMetadata.books.length).toBe(3);

    for (const b of bookMetadata.books as FixtureBook[]) {
      expect(typeof b.isbn).toBe('string');
      expect(b.isbn.length).toBeGreaterThanOrEqual(10);
      expect(typeof b.title).toBe('string');
      expect(b.title.length).toBeGreaterThan(0);
      expect(typeof b.author).toBe('string');
      expect(b.author.length).toBeGreaterThan(0);
      expect(typeof b.coverUrl).toBe('string');
      expect(typeof b.summary).toBe('string');
      expect(b.summary.length).toBeGreaterThan(20);
      expect(b.source).toBe('mock');
    }
  });

  it('loads 6 stages × 2 lines (12 segments) from script-gen.fixture.json', () => {
    const sg = scriptGen as FixtureScriptGen;
    expect(sg.templates).toBeDefined();
    const tpl = sg.templates.default;
    expect(tpl).toBeDefined();
    expect(Array.isArray(tpl.stages)).toBe(true);
    expect(tpl.stages.length).toBe(6);

    const stageOrder: FixtureStage['stage'][] = [
      'opening',
      'intro',
      'interpret',
      'review',
      'suggest',
      'closing',
    ];
    tpl.stages.forEach((s, i) => {
      expect(s.stage).toBe(stageOrder[i]);
      expect(s.lines.length).toBe(2);
      const hostCount = s.lines.filter((l) => l.speaker === 'host').length;
      const guestCount = s.lines.filter((l) => l.speaker === 'guest').length;
      expect(hostCount).toBe(1);
      expect(guestCount).toBe(1);
      // emotion must be one of the 5 v1.1 enum values
      const allowed = ['开心', '沉思', '激昂', '平和', '感慨'];
      for (const line of s.lines) {
        expect(allowed).toContain(line.emotion);
        expect(line.text.length).toBeGreaterThan(0);
      }
    });
    expect(sg.defaultTotalChars).toBeGreaterThan(0);
    expect(sg.defaultEstimatedDurationSec).toBeGreaterThan(0);
  });

  it('silence-1s.mp3 exists on disk and is non-trivial in size', () => {
    expect(fs.existsSync(SILENCE_MP3)).toBe(true);
    const stat = fs.statSync(SILENCE_MP3);
    expect(stat.size).toBeGreaterThan(1000);
    // The file must start with the ID3 magic or a valid MP3 frame sync.
    // (anullsrc libmp3lame output is allowed to start with an ID3v2 header
    //  "ID3" = 0x49 0x44 0x33, OR with a frame sync 0xFF 0xFB/0xFA/...)
    const fd = fs.openSync(SILENCE_MP3, 'r');
    const head = Buffer.alloc(3);
    try {
      fs.readSync(fd, head, 0, 3, 0);
    } finally {
      fs.closeSync(fd);
    }
    const isId3 = head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33;
    const isFrameSync = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
    expect(isId3 || isFrameSync).toBe(true);
  });

  it('all fixture files are located under backend/src/test/fixtures/', () => {
    for (const f of [BOOK_JSON, SCRIPT_JSON, SILENCE_MP3]) {
      expect(fs.existsSync(f)).toBe(true);
      // Resolved to an absolute path that lives under the backend tree.
      const normalized = path.resolve(f);
      expect(normalized.includes('backend')).toBe(true);
    }
  });
});
