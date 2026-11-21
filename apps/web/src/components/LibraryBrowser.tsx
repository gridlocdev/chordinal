// The browser under the channel rack (Chordinal PRD §7): the instruments by General MIDI family, the drum kits, the
// projects (Open Recent and those in Documents/Chordinal/), and the open project's whistled takes (§9.3). Click an
// instrument or a kit to hear it, double-click to put it on the selected track, or drag it onto a track or the channel
// rack. Click a take to read it onto the selected track at the playhead, or drag it onto a track.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { signal } from '@preact/signals';
import { soundfontLibrary } from '@chordinal/audio';
import type { LibraryPreset } from '@chordinal/audio';
import { folderTitle, projectFolders } from '@chordinal/ui';
import { settings, setSettings, selected, selectedTrack, projectName, beat } from '@chordinal/ui';
import type { BrowserTab } from '@chordinal/ui';
import type { NativeFolder } from '@chordinal/ui/native-bridge';
import { place } from '@chordinal/ui';
import { dropTake, takesKept } from '@chordinal/ui';
import { assignPreset } from '@chordinal/ui';
import { liveName } from '@chordinal/ui';
import { preview } from '@chordinal/ui';
import { presetMenu, takeMenu } from '@chordinal/ui';
import { PRESET, writePreset } from '@chordinal/ui';
import { LibraryPicker } from '@chordinal/ui/components';
import { recent, openRecent } from '../files.ts';
import { instrumentGroups, kits } from '../rack.ts';

const TABS: [BrowserTab, string][] = [
  ['instruments', 'Instruments'],
  ['kits', 'Kits'],
  ['projects', 'Projects'],
  ['takes', 'Takes'],
];

/** the open project's takes, as last listed */
const takes = signal<string[]>([]);

interface PresetProps {
  p: LibraryPreset;
}

function Preset({ p }: PresetProps) {
  return (
    <div
      class={`item ${p.name === liveName.value ? 'on' : ''}`}
      draggable
      title="Click to hear it, double-click to put it on the selected track"
      onDragStart={(e) => e.dataTransfer?.setData(PRESET, writePreset(p))}
      onClick={() => preview(p)}
      onDblClick={() => selected.value && assignPreset(selected.value, p)}
      onContextMenu={(e) => {
        e.preventDefault();
        presetMenu(p);
      }}
    >
      {p.name}
    </div>
  );
}

/**
 * Where a section heading sits in the list's content. The headings are sticky, so their own offsetTop moves once they
 * stick: measure from the row under them instead.
 */
function headTop(head: HTMLElement): number {
  const next = head.nextElementSibling;
  return next instanceof HTMLElement ? next.offsetTop - head.offsetHeight : head.offsetTop;
}

/** the index of the last section heading at or above the top of the list */
function sectionAtTop(list: HTMLElement): number {
  let at = 0;
  list.querySelectorAll<HTMLElement>('.group').forEach((h, i) => {
    if (headTop(h) <= list.scrollTop + 1) at = i;
  });
  return at;
}

interface SectionListProps {
  sections: string[];
  children: ComponentChildren;
}

/**
 * The scrolling list, with a dropdown above it to jump to a section when there's more than one (PRD §7.3). The
 * sections are the list's `.group` headings, in order.
 */
function SectionList({ sections, children }: SectionListProps) {
  const list = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const key = sections.join('\n');
  useEffect(() => {
    if (list.current) setAt(sectionAtTop(list.current));
  }, [key]);
  const jump = (i: number) => {
    const el = list.current;
    const head = el?.querySelectorAll<HTMLElement>('.group')[i];
    if (!el || !head) return;
    el.scrollTop = headTop(head);
    setAt(i);
  };
  return (
    <>
      {sections.length > 1 && (
        <div class="sections">
          <select
            aria-label="Go to section"
            value={String(Math.min(at, sections.length - 1))}
            onChange={(e) => jump(Number(e.currentTarget.value))}
          >
            {sections.map((s, i) => (
              <option value={String(i)}>{s}</option>
            ))}
          </select>
        </div>
      )}
      <div class="list" ref={list} onScroll={(e) => setAt(sectionAtTop(e.currentTarget))}>
        {children}
      </div>
    </>
  );
}

/** the kits, or the melodic instruments by family */
interface PresetsProps {
  kit: boolean;
}

function Presets({ kit }: PresetsProps) {
  const presets = useMemo(() => soundfontLibrary.presets(), [settings.value.library]);
  const groups: [string, LibraryPreset[]][] = kit
    ? [['Drum kits', kits(presets)]]
    : instrumentGroups(presets);
  return (
    <>
      <SectionList sections={kit ? [] : groups.map(([group]) => group)}>
        {groups.map(([group, list]) => (
          <>
            {!kit && <div class="group">{group}</div>}
            {list.map((p) => (
              <Preset p={p} />
            ))}
          </>
        ))}
      </SectionList>
      <div class="foot">
        <LibraryPicker />
      </div>
    </>
  );
}

function Projects() {
  const open = projectName.value;
  const [library, setLibrary] = useState<NativeFolder[]>([]);
  useEffect(() => {
    let live = true;
    projectFolders.library().then(
      (l) => {
        if (live) setLibrary(l);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [open, recent.value]);
  const item = (p: NativeFolder, missing = false) => (
    <div
      class={`item ${p.path === open ? 'on' : ''} ${missing ? 'missing' : ''}`}
      title={p.path}
      onClick={() => p.path !== open && openRecent(p.path)}
    >
      {folderTitle(p.path)}
    </div>
  );
  return (
    <SectionList sections={['Recent', 'Documents/Chordinal']}>
      <div class="group">Recent</div>
      {recent.value.length ? (
        recent.value.map((p) => item(p, !p.exists))
      ) : (
        <div class="empty">Projects you open or save show here.</div>
      )}
      <div class="group">Documents/Chordinal</div>
      {library.length ? library.map((p) => item(p)) : <div class="empty">No projects saved there yet.</div>}
    </SectionList>
  );
}

function Takes() {
  const name = projectName.value;
  const kept = takesKept.value;
  // a late answer for a project no longer shown is dropped
  useEffect(() => {
    let live = true;
    if (name)
      place.files.takes(name).then(
        (t) => {
          if (live) takes.value = t;
        },
        () => {},
      );
    else takes.value = [];
    return () => {
      live = false;
    };
  }, [name, kept]);
  const track = selectedTrack.value;
  if (!name)
    return (
      <div class="list">
        <div class="empty">Save the project to keep its whistled takes.</div>
      </div>
    );
  return (
    <>
      <div class="foot">
        {track
          ? `Click to read a take onto ${track.name} at the playhead`
          : 'Select a track to read a take onto it'}
      </div>
      <div class="list">
        {takes.value.length ? (
          takes.value.map((f) => (
            <div
              class="item"
              draggable
              onDragStart={(e) => e.dataTransfer?.setData('application/x-take', f)}
              onClick={() => track && dropTake(track.id, f, beat.value)}
              onContextMenu={(e) => {
                e.preventDefault();
                takeMenu(f, beat.value);
              }}
            >
              {f}
            </div>
          ))
        ) : (
          <div class="empty">Takes you record (●) are kept here.</div>
        )}
      </div>
    </>
  );
}

export function LibraryBrowser() {
  const tab = TABS.some(([id]) => id === settings.value.browserTab)
    ? settings.value.browserTab
    : 'instruments';
  return (
    <div class="browser">
      <div class="tabs">
        {TABS.map(([id, label]) => (
          <button class={tab === id ? 'on' : ''} onClick={() => setSettings({ browserTab: id })}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'projects' ? <Projects /> : tab === 'takes' ? <Takes /> : <Presets kit={tab === 'kits'} />}
    </div>
  );
}
