import { describe, expect, it } from 'vitest';
import { SAVE_FAILED, saveNotice } from './saveMessages';

describe('what she is told after saving a file', () => {
  it('says where it went when the device knows', () => {
    expect(saveNotice({ status: 'saved', where: 'your Downloads folder' }, 'your recording')).toEqual({
      kind: 'hint',
      text: 'Saved your recording to your Downloads folder.',
    });
  });

  it('still says it was saved when the device does not say where', () => {
    expect(saveNotice({ status: 'saved' }, 'your backup')).toEqual({ kind: 'hint', text: 'Saved your backup.' });
  });

  it('shows the reason when it could not be saved', () => {
    expect(saveNotice({ status: 'failed', message: 'There is no room left on this device.' }, 'your backup')).toEqual({
      kind: 'problem',
      text: 'There is no room left on this device.',
    });
  });

  it('falls back to a plain message when the reason is empty', () => {
    expect(saveNotice({ status: 'failed', message: '  ' }, 'your backup')).toEqual({ kind: 'problem', text: SAVE_FAILED });
  });

  it('says nothing when she closed the save box or the share sheet opened', () => {
    expect(saveNotice({ status: 'cancelled' }, 'your recording')).toBeNull();
    expect(saveNotice({ status: 'shared' }, 'your recording')).toBeNull();
  });
});
