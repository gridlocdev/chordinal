// The SoundFont library to play, and the ones not yet downloaded, with a button to download each.
import { soundfontLibrary } from '@chordinal/audio';
import { installedLibraries, libraryDownload } from '../store.ts';
import { chooseLibrary, downloadLibrary } from '../libraries.ts';

const megabytes = (lib)=> Math.round(lib.files.reduce((n, f)=> n + f.bytes, 0) / 1e6);

/** the SoundFont library to play, and the ones not yet downloaded */
export function LibraryPicker()
{
    const lib = soundfontLibrary.current;
    const have = installedLibraries.value, loading = libraryDownload.value;
    return (
        <>
            <select value={lib.id} onChange={(e)=> chooseLibrary(e.currentTarget.value)}>
                {soundfontLibrary.all.filter(l => have.includes(l.id)).map(l => <option value={l.id}>{l.name}</option>)}
            </select>
            {soundfontLibrary.all.filter(l => !have.includes(l.id)).map(l => (
                <div class="download" title={l.license}>
                    <span>{l.name}</span>
                    {loading?.id === l.id ? <span>{Math.round(loading.fraction * 100)}%</span>
                        : <button disabled={!!loading} onClick={()=> downloadLibrary(l.id)}>Download {megabytes(l)} MB</button>}
                </div>
            ))}
        </>
    );
}
