import fs from 'node:fs/promises';
import path from 'node:path';
import type { HighscoreEntry } from '@sms/shared';
import { MemoryHighscoreRepository } from './memoryRepository.js';
import { compareEntries } from './repository.js';

/** Human-readable JSON file store with atomic (tmp + rename) serialized writes. */
export class JsonFileHighscoreRepository extends MemoryHighscoreRepository {
  override readonly kind = 'json';
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {
    super();
  }

  override async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as {
        entries?: HighscoreEntry[];
      };
      this.entries = (raw.entries ?? []).sort(compareEntries);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      this.entries = [];
    }
  }

  protected override persist(): Promise<void> {
    const data = JSON.stringify({ version: 1, entries: this.entries }, null, 1);
    this.writeChain = this.writeChain.then(async () => {
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, data);
      await fs.rename(tmp, this.file);
    });
    return this.writeChain;
  }

  override async close(): Promise<void> {
    await this.writeChain;
  }
}
