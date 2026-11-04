/**
 * `/peers` — list live instances: name · harness(pid) · cwd · model ·
 * busy/idle · beat age. Text list always; the interactive picker runs ONLY
 * when `typeof ctx.ui?.select === 'function' && ctx.mode === 'tui'`, else
 * plain text. No UI module is ever imported — the primitive is probed on the
 * live ctx and invoked as a receiver method.
 */
import type { ExtensionHostLike } from '../peers/host.js';
import type { PeerRecord } from '../types.js';
export interface PeersSnapshot {
    ownName: string;
    mode: 'hub' | 'tools';
    peers: PeerRecord[];
    /** Batches held while the peer types — shown so held mail is visible. */
    held?: number;
}
/** Project = folder the session started in; older records may lack it. */
export declare function projectOf(p: PeerRecord): string;
/** Default `/peers` order: project, then peer name (case-insensitive). */
export declare function byProject(a: PeerRecord, b: PeerRecord): number;
/** Widest project column; longer folder names are clipped. */
export declare const PROJECT_COLUMN_MAX = 20;
/** Fixed-width project cell: clipped to `width`, padded so names align. */
export declare function projectCell(p: PeerRecord, width: number): string;
/** Column width for a set of peers: their longest project, capped. */
export declare function projectWidth(peers: PeerRecord[]): number;
/** `api          backend · omp(1234) · C:\work\api · model-id · working · beat 3s ago`. */
export declare function formatPeerLine(p: PeerRecord, now: number, selfName: string, width?: number): string;
export declare function formatPeersText(snap: PeersSnapshot, now: number): string;
export declare function registerPeersCommand(pi: ExtensionHostLike, getSnapshot: () => Promise<PeersSnapshot>): void;
