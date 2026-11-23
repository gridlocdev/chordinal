// The built CLI (apps/cli/dist/chordinal.mjs, `node tools/build.mjs`) end to end, in temporary folders: `render` on
// a tiny soundtrack (test/cli/fixtures/soundtrack.json, two project folders), and `export` of one of those projects. Each starts
// the CLI's hidden render browser, which the CLI ends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(ROOT, 'apps/cli/dist/chordinal.mjs');
const FIXTURES = path.join(ROOT, 'test/cli/fixtures');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const hasFfmpeg = (()=> { try { execFileSync(FFMPEG, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

/** runs the CLI in `cwd`; its output, or a failure with it */
function cli(cwd, ...args)
{
    const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, 0, `chordinal ${args.join(' ')} failed:\n${run.stdout}\n${run.stderr}`);
    return run.stdout;
}

const tmp = ()=> fs.mkdtempSync(path.join(os.tmpdir(), 'chordinal-cli-test-'));

test('help lists the commands, and a command explains itself', ()=>
{
    const dir = tmp();
    try
    {
        const help = cli(dir, 'help');
        for (const c of ['export', 'render']) assert.match(help, new RegExp(`\\b${c}\\b`));
        assert.match(cli(dir, 'render', '--help'), /usage: chordinal render <soundtrack\.json> <folder>/);
        const bad = spawnSync(process.execPath, [CLI, 'render', 'x.json', 'out', '--library', 'nope'], { cwd: dir, encoding: 'utf8' });
        assert.equal(bad.status, 2);
        assert.match(bad.stderr, /no SoundFont library nope; the libraries are generaluser/);
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('render: a looping and a one-shot track to mp3s and the tracks-data file', { skip: !hasFfmpeg && 'needs ffmpeg', timeout: 60000 }, async ()=>
{
    const dir = tmp();
    try
    {
        const data = path.join('src', 'tracks-data.js');
        fs.mkdirSync(path.join(dir, 'src'));
        // an entry from an earlier render, for a track no longer in the soundtrack file, drops out
        fs.writeFileSync(path.join(dir, data), 'export const TRACKS = {"gone": {"file": "music/gone.mp3"}};\n');
        const out = cli(dir, 'render', path.join(FIXTURES, 'soundtrack.json'), 'music', '--data', data);
        assert.match(out, /^loop: "Test Loop", [\d.]+ s in \d+ s, gain -?[\d.]+ dB, [\d.]+ MB$/m);
        assert.match(out, /^sting: decodes \d+ frames \([+-]\d+\), first sound [+-]\d+ frames from where it was rendered$/m);

        for (const id of ['loop', 'sting'])
        {
            const mp3 = fs.readFileSync(path.join(dir, 'music', `${id}.mp3`));
            assert.ok(mp3.length > 10000, `${id}.mp3 has sound`);
            assert.ok(mp3.subarray(0, 3).toString() === 'ID3' || (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0), `${id}.mp3 is an mp3`);
        }
        const { TRACKS } = await import(pathToFileURL(path.join(dir, data)).href);
        assert.deepEqual(Object.keys(TRACKS), ['loop', 'sting']);
        const { loop, sting } = TRACKS;
        assert.equal(loop.file, 'music/loop.mp3');
        assert.equal(loop.level, 0.5, 'extra fields are copied');
        assert.equal(loop.rate, 44100);
        assert.equal(loop.tempo, 180);
        assert.equal(loop.offset, 0.05);
        assert.equal(loop.end, null);
        // the loop runs from the first A (after a one-bar intro) to the second, four bars on, at 4/3 s a bar
        assert.ok(Math.abs(loop.loop.start - (0.05 + 4 / 3)) < 1e-3, `loop start ${loop.loop.start}`);
        assert.ok(Math.abs(loop.loop.end - (0.05 + 20 / 3)) < 1e-3, `loop end ${loop.loop.end}`);
        assert.ok(Math.abs(loop.seconds - (loop.loop.end + 0.25)) < 1e-3, 'a looping file stops just after its loop');
        assert.ok(Math.abs(loop.frames - loop.seconds * 44100) < 5, 'frames and seconds agree (seconds are rounded)');
        assert.equal(sting.loop, null);
        assert.ok(sting.end > 0.05 + 2.9 && sting.seconds > sting.end + 3, 'a one-shot rings on after its end');
        assert.match(fs.readFileSync(path.join(dir, data), 'utf8'), /^\/\/ The soundtrack: .*chordinal render/);
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** a 16-bit WAV's samples and its sample rate (one channel's frames interleaved with the other's) */
function readWav(file)
{
    const wav = fs.readFileSync(file);
    const rate = wav.readUInt32LE(24), channels = wav.readUInt16LE(22);
    const samples = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length - (wav.length - 44) % 2));
    return { samples, rate, channels };
}

/** the loudest sample between two times, in seconds */
function peakBetween({ samples, rate, channels }, from, to)
{
    let peak = 0;
    for (let i = Math.floor(from * rate) * channels; i < Math.min(samples.length, Math.floor(to * rate) * channels); i++)
        peak = Math.max(peak, Math.abs(samples[i]));
    return peak;
}

test('export plays volume automation: a lane set to 0 silences the track from that beat', { timeout: 60000 }, ()=>
{
    const dir = tmp();
    try
    {
        fs.cpSync(path.join(FIXTURES, 'loop'), path.join(dir, 'tiny'), { recursive: true });
        const file = path.join(dir, 'tiny', 'project.json');
        const p = JSON.parse(fs.readFileSync(file, 'utf8'));
        // 180 bpm: beat 14 is at 4.67 s, and the song runs to beat 28 (9.33 s)
        for (const t of p.tracks) t.automation = { ...t.automation, volume: [{ beat: 0, value: 1, curve: 'set' }, { beat: 14, value: 0, curve: 'set' }] };
        fs.writeFileSync(file, JSON.stringify(p));
        cli(dir, 'export', 'tiny', '--out', 'exported');
        const wav = readWav(path.join(dir, 'exported', 'tiny.wav'));
        const before = peakBetween(wav, 1.5, 4.5), after = peakBetween(wav, 7.5, 9.3);
        assert.ok(before > 1000, `sound before the lane drops (peak ${before})`);
        assert.ok(after < before / 50, `silence once the reverb has died away (peak ${after} against ${before})`);
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** exports the loop fixture with each track changed by `change`; its WAV */
function exportWith(dir, name, change)
{
    fs.cpSync(path.join(FIXTURES, 'loop'), path.join(dir, name), { recursive: true });
    const file = path.join(dir, name, 'project.json');
    const p = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const t of p.tracks) change(t);
    fs.writeFileSync(file, JSON.stringify(p));
    cli(dir, 'export', name, '--out', 'exported');
    return readWav(path.join(dir, 'exported', `${name}.wav`));
}

const EFFECT_TYPES = ['eq', 'compressor', 'filter', 'distortion', 'chorus', 'delay', 'reverb', 'phaser', 'flanger', 'tremolo', 'bitcrusher', 'limiter', 'width', 'gain'];

test('export plays track effects: a bypassed one changes nothing, a gain is heard, and every effect renders', { timeout: 120000 }, ()=>
{
    const dir = tmp();
    try
    {
        const plain = exportWith(dir, 'plain', ()=> {});
        const bypassed = exportWith(dir, 'bypassed', (t)=> { t.inserts = [{ id: 'fx1', type: 'gain', bypass: true, params: { gain: -24 } }]; });
        // two exports of one project differ by a step in a few samples, so "the same" allows that
        assert.equal(bypassed.samples.length, plain.samples.length);
        let worst = 0;
        for (let i = 0; i < plain.samples.length; i++) worst = Math.max(worst, Math.abs(plain.samples[i] - bypassed.samples[i]));
        assert.ok(worst <= 2, `a bypassed effect leaves the sound as it was (off by up to ${worst})`);
        const quiet = exportWith(dir, 'quiet', (t)=> { t.inserts = [{ id: 'fx1', type: 'gain', params: { gain: -20 } }]; });
        const loud = peakBetween(plain, 0, 9), soft = peakBetween(quiet, 0, 9);
        assert.ok(soft < loud / 4, `a −20 dB gain is heard (peak ${soft} against ${loud})`);
        // an automated gain: the lane sets it to −30 dB, so the export is as quiet as with the setting itself
        const automated = exportWith(dir, 'automated', (t)=> {
            t.inserts = [{ id: 'fx1', type: 'gain', params: {} }];
            t.automation = { ...t.automation, 'fx1.gain': [{ beat: 0, value: -30, curve: 'set' }] };
        });
        const ducked = peakBetween(automated, 0, 9);
        assert.ok(ducked < soft, `an effect's lane is played (peak ${ducked} against ${soft})`);
        // the Bitcrusher runs in a worklet: at 2 bits it's far from the plain sound, so the worklet loaded
        const crushed = exportWith(dir, 'crushed', (t)=> { t.inserts = [{ id: 'fx1', type: 'bitcrusher', params: { bits: 2, downsample: 8 } }]; });
        let apart = 0;
        for (let i = 0; i < plain.samples.length; i++) apart = Math.max(apart, Math.abs(plain.samples[i] - crushed.samples[i]));
        assert.ok(apart > 1000, `the Bitcrusher is heard (differs by up to ${apart})`);
        const all = exportWith(dir, 'all', (t)=> { t.inserts = EFFECT_TYPES.map((type, i)=> ({ id: `fx${i + 1}`, type, params: {} })); });
        const peak = peakBetween(all, 0, 9);
        assert.ok(peak > 500, `every effect in a row still makes sound (peak ${peak})`);
        assert.notDeepEqual(all.samples, plain.samples);
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('export makes a project folder’s MIDI and WAV', { timeout: 60000 }, ()=>
{
    const dir = tmp();
    try
    {
        fs.cpSync(path.join(FIXTURES, 'loop'), path.join(dir, 'tiny'), { recursive: true });
        cli(dir, 'export', 'tiny', '--out', 'exported');
        const midi = fs.readFileSync(path.join(dir, 'exported', 'tiny.mid'));
        assert.equal(midi.subarray(0, 4).toString(), 'MThd');
        const wav = fs.readFileSync(path.join(dir, 'exported', 'tiny.wav'));
        assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
        // 16-bit samples after the 44-byte header: some are well above silence
        const samples = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length - (wav.length - 44) % 2));
        let peak = 0;
        for (const s of samples) peak = Math.max(peak, Math.abs(s));
        assert.ok(peak > 1000, `the WAV has sound (peak ${peak})`);
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
