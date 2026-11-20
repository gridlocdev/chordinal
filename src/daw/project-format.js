// The project file: project.json in a project's folder. JSON, two-space indented so changes diff well, except that each
// note is one compact line, [beat, beats, key, vel] with its marks as a fifth item when it has any, so a song is a
// few hundred kilobytes rather than megabytes. Pure.
//
// Version 1 has every clip's notes in the clip. Version 2 adds patterns (PRD §7): their notes, length and step are
// written once in `patterns`, and a pattern clip is just { id, start, pattern, mute? }. A project with no pattern clips
// is written as version 1, so older versions of the app still open it.

export const FORMAT = 'music-generator-project';
export const VERSION = 1;
export const PATTERN_VERSION = 2;

const NOTE = ['beat', 'beats', 'key', 'vel'];
/** the order a project's settings are written in, before its patterns and tracks; any others follow */
const ORDER = ['title', 'length', 'tempoMap', 'meters', 'key', 'markers', 'loop', 'groove', 'chords'];
const round = (x)=> Math.round(x * 1e4) / 1e4;

/** @param {import('./project.js').Project} project */
export function writeProject(project)
{
    const rows = [];
    const placeholders = (notes)=> notes.map(n =>
    {
        const { beat, beats, key, vel, ...marks } = n;
        const row = [round(beat), round(beats), key, vel];
        if (Object.keys(marks).length) row.push(marks);
        rows.push(JSON.stringify(row));
        return `\u0000${rows.length - 1}`;
    });
    const { patterns = [], ...rest } = project;
    // PRD §3.11: a pattern no clip plays any more isn't written; the first clip of each gives its notes
    const firstClip = new Map();
    for (const t of project.tracks) for (const c of t.clips) if (c.pattern && !firstClip.has(c.pattern)) firstClip.set(c.pattern, c);
    const used = patterns.filter(x => firstClip.has(x.id));
    // a fixed order, whatever order the project's keys are in, so opening and saving a project changes nothing
    const { tracks: _tracks, ...settings } = rest;
    const ordered = Object.fromEntries([...ORDER.filter(k => k in settings), ...Object.keys(settings).filter(k => !ORDER.includes(k))]
        .map(k => [k, settings[k]]));
    const body = { format: FORMAT, version: used.length ? PATTERN_VERSION : VERSION, ...ordered,
        ...(used.length && { patterns: used.map(x =>
        {
            const c = firstClip.get(x.id);
            return { id: x.id, name: x.name, beats: c.beats, ...(c.step !== undefined && { step: c.step }), notes: placeholders(c.notes) };
        }) }),
        tracks: project.tracks.map(t => ({ ...t, clips: t.clips.map(c => c.pattern
            ? { id: c.id, start: c.start, pattern: c.pattern, ...(c.mute && { mute: true }) }
            : { ...c, notes: placeholders(c.notes) }) })) };
    return JSON.stringify(body, null, 2).replace(/"\\u0000(\d+)"/g, (_, i)=> rows[Number(i)]) + '\n';
}

const readNotes = (list)=> list.map(row => ({ ...Object.fromEntries(NOTE.map((k, i)=> [k, row[i]])), ...row[4] }));

const isNum = (x)=> typeof x === 'number' && Number.isFinite(x);
const isList = Array.isArray;

/** what is wrong with a note row as written, or null */
function badRow(row)
{
    if (!isList(row) || row.length < 4) return 'is not [beat, beats, key, vel]';
    const [beat, beats, key, vel, marks] = row;
    if (!isNum(beat) || beat < 0) return 'has no beat of 0 or more';
    if (!isNum(beats) || beats <= 0) return 'has no length above 0';
    if (!Number.isInteger(key) || key < 0 || key > 127) return 'has no key from 0 to 127';
    if (!isNum(vel) || vel < 0 || vel > 127) return 'has no velocity from 0 to 127';
    if (marks !== undefined && (typeof marks !== 'object' || marks === null || isList(marks))) return 'has marks that are not an object';
    return null;
}

/** the first thing in a read project (before its notes are unpacked) that the app can't play, or null */
function problemIn(project, patterns)
{
    const { title, length, tempoMap, meters, tracks } = project;
    if (typeof title !== 'string') return 'title is not text';
    if (!isNum(length) || length <= 0) return 'length is not above 0';
    if (!isList(tempoMap) || !tempoMap.length || tempoMap[0].beat !== 0) return 'tempo map does not start at beat 0';
    for (const [i, s] of tempoMap.entries())
        if (!isNum(s?.beat) || !isNum(s.bpm) || s.bpm <= 0 || (s.to !== undefined && (!isNum(s.to) || s.to <= 0))) return `tempo change ${i + 1} has no tempo above 0`;
    if (!isList(meters) || !meters.length) return 'meters are missing';
    for (const [i, m] of meters.entries())
        if (!isNum(m?.beat) || !/^\d+\/\d+$/.test(m.sig ?? '')) return `meter ${i + 1} is not like 4/4`;
    if (!isList(patterns)) return 'patterns are not a list';
    for (const x of patterns)
    {
        if (typeof x?.id !== 'string' || !isNum(x.beats) || x.beats <= 0 || !isList(x.notes)) return `pattern ${x?.id ?? '?'} has no id, length or notes`;
        for (const [k, row] of x.notes.entries()) { const bad = badRow(row); if (bad) return `pattern ${x.id}, note ${k + 1} ${bad}`; }
    }
    if (!isList(tracks)) return 'tracks are not a list';
    const ids = new Set();
    for (const [i, t] of tracks.entries())
    {
        const name = `track ${i + 1}`;
        if (typeof t?.id !== 'string' || ids.has(t.id)) return `${name} has no id of its own`;
        ids.add(t.id);
        if (!isList(t.clips)) return `${name} has no list of clips`;
        for (const c of t.clips)
        {
            if (typeof c?.id !== 'string' || ids.has(c.id)) return `${name} has a clip with no id of its own`;
            ids.add(c.id);
            if (!isNum(c.start) || c.start < 0) return `${name}, clip ${c.id} has no start of 0 or more`;
            if (c.pattern !== undefined) continue;
            if (!isNum(c.beats) || c.beats <= 0) return `${name}, clip ${c.id} has no length above 0`;
            if (!isList(c.notes)) return `${name}, clip ${c.id} has no list of notes`;
            for (const [k, row] of c.notes.entries()) { const bad = badRow(row); if (bad) return `${name}, clip ${c.id}, note ${k + 1} ${bad}`; }
        }
    }
    return null;
}

/**
 * @param {string} text
 * @returns {import('./project.js').Project}
 */
export function readProject(text)
{
    const data = JSON.parse(text);
    if (data?.format !== FORMAT) throw new Error('not a Music Generator project');
    if (data.version !== VERSION && data.version !== PATTERN_VERSION)
        throw new Error(`project version ${data.version}; this app reads versions ${VERSION} and ${PATTERN_VERSION}`);
    const { format, version, patterns: written = [], ...project } = data;
    for (const key of ['title', 'length', 'tempoMap', 'meters', 'tracks'])
        if (project[key] === undefined) throw new Error(`the project has no ${key}`);
    const problem = problemIn(project, written);
    if (problem) throw new Error(`the project's ${problem}`);
    const patterns = new Map(written.map(x => [x.id, { ...x, notes: readNotes(x.notes) }]));
    project.tracks = project.tracks.map(t => ({ ...t, clips: t.clips.map(c =>
    {
        if (!c.pattern) return { ...c, notes: readNotes(c.notes) };
        const x = patterns.get(c.pattern);
        if (!x) throw new Error(`clip ${c.id} plays pattern ${c.pattern}, which the project doesn't have`);
        // PRD §7.5: in memory every pattern clip holds its pattern's notes, length and step
        return { ...c, beats: x.beats, notes: x.notes, ...(x.step !== undefined && { step: x.step }) };
    }) }));
    if (patterns.size) project.patterns = written.map(x => ({ id: x.id, name: x.name }));
    return { key: null, markers: [], loop: null, groove: {}, chords: [], ...project };
}
