import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  lstatSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { contentHash } from './validation-inputs.js';

export interface Receipt<T> {
  version: 1;
  id: string;
  input: string;
  producer: string;
  originRun: string;
  status: 'passed';
  durationMs: number;
  artifacts: Record<string, string>;
  value: T;
}
/** Local runner provenance, not a defense against an actor with arbitrary checkout/key access.
 * CI uses a fresh key and never restores local receipts or keys. */
export class EvidenceCache {
  private readonly key: Buffer;
  readonly directory: string;
  constructor(
    readonly root: string,
    readonly runId: string,
    fresh = false,
  ) {
    this.directory = resolve(root, 'validation-results/cache');
    mkdirSync(this.directory, { recursive: true });
    const keyPath = resolve(root, 'validation-results/receipt-key');
    if (fresh || !existsSync(keyPath))
      writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
    if (!lstatSync(keyPath).isFile()) throw new Error('Invalid evidence key.');
    this.key = readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error('Invalid evidence key length.');
  }
  path(id: string, input: string): string {
    return resolve(this.directory, `${contentHash(`${id}:${input}`)}.json`);
  }
  private signature(payload: string): string {
    return createHmac('sha256', this.key).update(payload).digest('hex');
  }
  read<T>(id: string, input: string): Receipt<T> | null {
    try {
      const envelope = JSON.parse(
        readFileSync(this.path(id, input), 'utf8'),
      ) as { payload: string; signature: string };
      if (
        typeof envelope.payload !== 'string' ||
        this.signature(envelope.payload) !== envelope.signature
      )
        return null;
      const r = JSON.parse(envelope.payload) as Omit<
        Receipt<T>,
        'version' | 'status'
      > & { version: unknown; status: unknown };
      if (
        r.version !== 1 ||
        r.id !== id ||
        r.input !== input ||
        r.producer !== 'scoped-validation-v1' ||
        r.status !== 'passed' ||
        !r.originRun
      )
        return null;
      for (const [path, hash] of Object.entries(r.artifacts)) {
        if (
          !lstatSync(resolve(this.root, path)).isFile() ||
          contentHash(readFileSync(resolve(this.root, path))) !== hash
        )
          return null;
      }
      return r as Receipt<T>;
    } catch {
      return null;
    }
  }
  write<T>(
    id: string,
    input: string,
    value: T,
    durationMs: number,
    artifacts: Record<string, string> = {},
  ): Receipt<T> {
    const receipt: Receipt<T> = {
      version: 1,
      id,
      input,
      producer: 'scoped-validation-v1',
      originRun: this.runId,
      status: 'passed',
      durationMs,
      artifacts,
      value,
    };
    const payload = JSON.stringify(receipt);
    const path = this.path(id, input),
      temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(
      temporary,
      JSON.stringify({ payload, signature: this.signature(payload) }) + '\n',
    );
    renameSync(temporary, path);
    return receipt;
  }
}
