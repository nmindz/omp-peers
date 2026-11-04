/**
 * `/peers` — list live instances: name · harness(pid) · cwd · model ·
 * busy/idle · beat age. Text list always; the interactive picker runs ONLY
 * when `typeof ctx.ui?.select === 'function' && ctx.mode === 'tui'`, else
 * plain text. No UI module is ever imported — the primitive is probed on the
 * live ctx and invoked as a receiver method.
 */
import { formatBeatAge } from '../peers/presence.js';
/** Project = folder the session started in; older records may lack it. */
export function projectOf(p) {
    return p.project || p.cwd.split(/[\\/]/).filter(Boolean).pop() || p.cwd;
}
/** Default `/peers` order: project, then peer name (case-insensitive). */
export function byProject(a, b) {
    return (projectOf(a).localeCompare(projectOf(b), undefined, { sensitivity: 'base' }) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
/** Widest project column; longer folder names are clipped. */
export const PROJECT_COLUMN_MAX = 20;
/** Fixed-width project cell: clipped to `width`, padded so names align. */
export function projectCell(p, width) {
    return projectOf(p).slice(0, width).padEnd(width);
}
/** Column width for a set of peers: their longest project, capped. */
export function projectWidth(peers) {
    return Math.min(PROJECT_COLUMN_MAX, Math.max(1, ...peers.map((p) => projectOf(p).length)));
}
/** `api          backend · omp(1234) · C:\work\api · model-id · working · beat 3s ago`. */
export function formatPeerLine(p, now, selfName, width = projectWidth([p])) {
    const self = p.name === selfName ? ' · you' : '';
    const activity = p.activity ? ` · ${p.activity}` : '';
    const todos = p.todos?.length
        ? ` · ${p.todos.length} todo${p.todos.length === 1 ? '' : 's'}`
        : '';
    return `${projectCell(p, width)}  ${p.name} · ${p.harness}(${p.pid}) · ${p.cwd} · ${p.model === '' ? '—' : p.model} · ${p.busy ? 'working' : 'idle'} · beat ${formatBeatAge(p.beatAt, now)}${activity}${todos}${self}`;
}
export function formatPeersText(snap, now) {
    const width = projectWidth(snap.peers);
    const lines = [...snap.peers].sort(byProject).map((p) => formatPeerLine(p, now, snap.ownName, width));
    const header = `peers (${snap.peers.length}) — you are \`${snap.ownName}\` via ${snap.mode === 'hub' ? 'hub bridge' : 'peer tools'}${(snap.held ?? 0) > 0 ? ` · held ${snap.held}` : ''}`;
    return lines.length === 0 ? `${header} — no peers` : `${header}\n${lines.join('\n')}`;
}
export function registerPeersCommand(pi, getSnapshot) {
    pi.registerCommand('peers', {
        description: 'List live peer instances on this machine',
        handler: async (_args, ctx) => {
            try {
                const snap = await getSnapshot();
                const select = ctx.ui?.select;
                if (typeof select === 'function' && ctx.mode === 'tui' && snap.peers.length > 0) {
                    try {
                        // Labels lead with an aligned project column; map back to the record by label.
                        const width = projectWidth(snap.peers);
                        const byLabel = new Map();
                        for (const p of [...snap.peers].sort(byProject))
                            byLabel.set(`${projectCell(p, width)}  ${p.name}`, p);
                        const picked = await select.call(ctx.ui, 'Peers — pick one for details', [...byLabel].map(([label, p]) => ({
                            label,
                            description: `${p.harness}(${p.pid}) · ${p.cwd}${p.busy ? ' · working' : ''}${p.activity ? ` · ${p.activity}` : ''}`,
                        })));
                        if (typeof picked === 'string' && picked !== '') {
                            const peer = byLabel.get(picked) ?? snap.peers.find((p) => p.name === picked);
                            ctx.ui.notify(peer !== undefined ? formatPeerLine(peer, Date.now(), snap.ownName) : formatPeersText(snap, Date.now()), 'info');
                        }
                        return;
                    }
                    catch {
                        // Picker failed — fall through to the text list.
                    }
                }
                ctx.ui.notify(formatPeersText(snap, Date.now()), 'info');
            }
            catch (err) {
                try {
                    ctx.ui.notify(`/peers failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
                }
                catch {
                    // Notify is best-effort.
                }
            }
        },
    });
}
