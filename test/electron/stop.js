// Stopping an Electron app under test so it is really gone, on every platform.
import { execFileSync } from 'node:child_process';

/**
 * Kills an app's process and waits until it has exited. On Windows killing Electron's main process leaves its GPU and
 * utility processes running: they keep the profile's files locked (the next rm fails with EBUSY) and their pipes keep
 * the test file's event loop alive, so the run never ends. taskkill /T takes the whole tree.
 */
export async function stop(proc, limitMs = 15000)
{
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
    const exited = new Promise(r => proc.once('exit', r));
    if (process.platform === 'win32') { try { execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ } }
    else proc.kill('SIGKILL');
    await Promise.race([exited, new Promise(r => setTimeout(r, limitMs))]);
}
