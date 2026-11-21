import test from 'node:test';
import assert from 'node:assert/strict';
import { screenCalls } from '../../apps/desktop/src/headless-screen.ts';

/** a stand-in for electron's dialog and shell that fails the test if anything reaches it */
function forbidden()
{
    const no = (name)=> ()=> assert.fail(`${name} was called in a headless run`);
    return { dialog: { showSaveDialog: no('showSaveDialog'), showOpenDialog: no('showOpenDialog'), showMessageBoxSync: no('showMessageBoxSync') },
        shell: { openPath: no('openPath'), openExternal: no('openExternal'), showItemInFolder: no('showItemInFolder') } };
}

test('a headless run shows no dialog or Finder window, and keeps what it would have shown', async ()=>
{
    const s = screenCalls({ headless: true, ...forbidden() });
    assert.deepEqual(await s.saveDialog(null, { title: 'a' }), { canceled: true, filePath: '' });
    assert.deepEqual(await s.openDialog(null, { title: 'b' }), { canceled: true, filePaths: [] });
    assert.equal(s.askToClose(null, { message: 'Close without saving?' }), true);
    await s.openPath('/x.md');
    await s.openExternal('https://example.com');
    s.showInFolder('/y');
    assert.deepEqual(globalThis.headlessPrompts.map(p => p.kind), ['saveDialog', 'openDialog', 'askToClose', 'openPath', 'openExternal', 'showInFolder']);
    assert.equal(globalThis.headlessPrompts.at(-1).what, '/y');
});

test('a headless test can queue what a dialog answers, once', async ()=>
{
    const s = screenCalls({ headless: true, ...forbidden() });
    globalThis.headlessAnswers.saveDialog.push('/tmp/Song');
    globalThis.headlessAnswers.openDialog.push('/tmp/Other/project.json');
    assert.deepEqual(await s.saveDialog(null, {}), { canceled: false, filePath: '/tmp/Song' });
    assert.deepEqual(await s.saveDialog(null, {}), { canceled: true, filePath: '' });
    assert.deepEqual(await s.openDialog(null, {}), { canceled: false, filePaths: ['/tmp/Other/project.json'] });
});
