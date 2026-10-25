import { describe, expect, it } from 'vitest';
import { imagePathsOf, thumbUrlOf } from '../../packages/shared/src/images';

const full = 'https://firebasestorage.googleapis.com/v0/b/reva-nest-foodcourt.firebasestorage.app/o/menus%2Fv-rm%2Fabc-d3f.jpg?alt=media&token=secret-token';

describe('thumbUrlOf', () => {
  it('points a dish photo at its small sibling, without the full photo\'s download token', () => {
    expect(thumbUrlOf(full)).toBe('https://firebasestorage.googleapis.com/v0/b/reva-nest-foodcourt.firebasestorage.app/o/menus%2Fv-rm%2Fabc-d3f-t.jpg?alt=media');
  });

  it('has nothing to offer for missing, foreign or already-small links', () => {
    expect(thumbUrlOf(undefined)).toBeNull();
    expect(thumbUrlOf(null)).toBeNull();
    expect(thumbUrlOf('not a url')).toBeNull();
    expect(thumbUrlOf('https://example.com/menus/v-rm/a.jpg')).toBeNull();
    expect(thumbUrlOf(full.replace('abc-d3f.jpg', 'abc-d3f-t.jpg'))).toBeNull();
    expect(thumbUrlOf(full.replace('.jpg', '.png'))).toBeNull();
  });
});

describe('imagePathsOf', () => {
  it('names the photo and its small copy, and nothing else', () => {
    expect(imagePathsOf(full)).toEqual({ full: 'menus/v-rm/abc-d3f.jpg', thumb: 'menus/v-rm/abc-d3f-t.jpg' });
  });

  it('refuses links that are not a shop photo, so a delete can never reach anything else', () => {
    expect(imagePathsOf(undefined)).toBeNull();
    expect(imagePathsOf('https://example.com/menus/v-rm/a.jpg')).toBeNull();
    expect(imagePathsOf(full.replace('menus%2Fv-rm%2Fabc-d3f.jpg', 'public%2Fqr.jpg'))).toBeNull();
    expect(imagePathsOf(full.replace('menus%2Fv-rm%2F', 'menus%2Fv-rm%2F..%2Fx%2F'))).toBeNull();
    expect(imagePathsOf(full.replace('abc-d3f.jpg', 'abc-d3f-t.jpg'))).toBeNull();
  });
});

