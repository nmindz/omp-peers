/**
 * Peer-name validation and cross-process deconfliction.
 *
 * A peer name is an address: `^[\w.-]{1,24}$`. `Main` is refused
 * (case-sensitive exact match — it names the host's driving agent and must
 * never be taken by a peer), as is any live local subagent id handed in via
 * `localIds`. Cross-process collisions resolve first-wins by `startedAt`;
 * the younger instance auto-suffixes `-<pid>`.
 */

import { basename } from 'node:path';

import { PeerNameError } from '../errors.js';
import type { PeerRecord } from '../types.js';

export const PEER_NAME_PATTERN = /^[\w.-]{1,24}$/;

/**
 * The host driving agent's id. This is a REFUSED NAME, never a delivery
 * address — the inbound path always targets this instance's own discovered
 * local agent id (see `peers/inbound.ts`).
 */
const REFUSED_HOST_NAME = 'Main';

export function isValidPeerName(name: string): boolean {
  return PEER_NAME_PATTERN.test(name) && name !== REFUSED_HOST_NAME;
}

/** Throw {@link PeerNameError} unless `name` is usable as a peer address. */
export function validatePeerName(name: string, opts: { localIds?: Iterable<string> } = {}): void {
  if (!PEER_NAME_PATTERN.test(name)) {
    throw new PeerNameError(
      `invalid peer name "${name}" — use 1-24 of a-z A-Z 0-9 _ . - (no spaces)`
    );
  }
  if (name === REFUSED_HOST_NAME) {
    throw new PeerNameError(`"${name}" names the host driving agent — pick another peer name`);
  }
  if (opts.localIds !== undefined) {
    for (const id of opts.localIds) {
      if (id === name) {
        throw new PeerNameError(
          `"${name}" collides with a live local subagent id — pick another peer name`
        );
      }
    }
  }
}

/** Default address for an instance: sanitized `<basename(cwd)>-<pid>`. */
export function defaultPeerName(cwd: string, pid: number): string {
  // The pid suffix is computed first so the 24-char cap can never truncate
  // pid digits — a truncated pid would collide across processes.
  const suffix = `-${pid}`;
  const base =
    basename(cwd)
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24 - suffix.length) || 'peer';
  return `${base}${suffix}`.slice(0, 24);
}

/**
 * Slug a free-form session title into an address: drops the omp 18.9 title
 * card icon, lowercases, joins words with `-`, and cuts at a word boundary
 * within 24 chars. `🔀 MERGE: Reconcile origin master` → `merge-reconcile-origin`.
 */
export function slugifySessionTitle(raw: string): string | undefined {
  const words = raw
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w !== '' && !/^\.+$/.test(w));
  let out = '';
  for (const word of words) {
    const next = out === '' ? word : `${out}-${word}`;
    if (next.length > 24) break;
    out = next;
  }
  if (out === '' && words[0] !== undefined) out = words[0].slice(0, 24);
  return out !== '' && isValidPeerName(out) ? out : undefined;
}

/**
 * Derive a peer address from the host session name. A valid raw name is used
 * as-is; any other name (including omp's generated card titles) is slugged by
 * {@link slugifySessionTitle}. Only an unsluggable name falls back to
 * {@link defaultPeerName}, with `rejected` set so the caller can warn once —
 * silently for `"auto"` titles. Collisions resolve later via {@link resolvePeerName}.
 */
export function peerNameFromSession(
  raw: string | undefined,
  cwd: string,
  pid: number,
  opts: { titleSource?: string } = {}
): { name: string; rejected?: string } {
  if (raw === undefined || raw === '') return { name: defaultPeerName(cwd, pid) };
  if (isValidPeerName(raw)) return { name: raw };
  if (raw === REFUSED_HOST_NAME) return { name: defaultPeerName(cwd, pid), rejected: raw };
  const slug = slugifySessionTitle(raw);
  if (slug !== undefined) return { name: slug };
  if (opts.titleSource === 'auto') return { name: defaultPeerName(cwd, pid) };
  return { name: defaultPeerName(cwd, pid), rejected: raw };
}

export interface ResolveNameInput {
  candidate: string;
  pid: number;
  startedAt: number;
  peers: PeerRecord[];
  /** Live local subagent ids — treated as held, like an older peer. */
  localIds?: Iterable<string>;
}

/**
 * First-wins by `startedAt`: when another live peer holds `candidate` and
 * started no later than us (or a local id holds it), take `<candidate>-<pid>`.
 * The suffixed form is intentionally exempt from the 24-char cap so it stays
 * deterministic and searchable.
 */
export function resolvePeerName(input: ResolveNameInput): string {
  const heldByLocal =
    input.localIds !== undefined
      ? [...input.localIds].some((id) => id === input.candidate)
      : false;
  const clash =
    heldByLocal ||
    input.peers.some(
      (p) => p.pid !== input.pid && p.name === input.candidate && p.startedAt <= input.startedAt
    );
  return clash ? `${input.candidate}-${input.pid}` : input.candidate;
}
