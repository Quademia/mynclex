import { describe, it, expect } from 'vitest';
import { deviceLabelFrom } from './device-label';

// Real user-agent strings. Written out in full rather than reduced to the
// substring under test, because the whole risk in this file is that
// browsers impersonate each other INSIDE these strings — a trimmed
// fixture would quietly remove the thing that can break.
const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  windowsFirefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15 iPad',
  curl: 'curl/8.4.0',
};

describe('deviceLabelFrom', () => {
  it('reads the common student devices', () => {
    expect(deviceLabelFrom(UA.androidChrome)).toBe('Android · Chrome');
    expect(deviceLabelFrom(UA.iphoneSafari)).toBe('iPhone · Safari');
    expect(deviceLabelFrom(UA.windowsChrome)).toBe('Windows · Chrome');
    expect(deviceLabelFrom(UA.macSafari)).toBe('Mac · Safari');
    expect(deviceLabelFrom(UA.windowsFirefox)).toBe('Windows · Firefox');
  });

  // ⭐ The reason BROWSERS is ordered rather than alphabetical. Each of
  // these user-agents contains the name of a browser it is not, and an
  // unordered lookup would report the impostor.
  describe('browsers that impersonate other browsers', () => {
    it('does not call Edge "Chrome" — its UA contains Chrome AND Safari', () => {
      expect(UA.windowsEdge).toContain('Chrome/');
      expect(deviceLabelFrom(UA.windowsEdge)).toBe('Windows · Edge');
    });

    it('does not call Samsung Internet "Chrome"', () => {
      expect(UA.androidSamsung).toContain('Chrome/');
      expect(deviceLabelFrom(UA.androidSamsung)).toBe('Android · Samsung Internet');
    });

    it('does not call Chrome "Safari" — every Chrome UA ends in Safari', () => {
      expect(UA.windowsChrome).toContain('Safari/');
      expect(deviceLabelFrom(UA.windowsChrome)).toBe('Windows · Chrome');
    });

    it('reads Chrome on iOS, which is branded CriOS', () => {
      expect(deviceLabelFrom(UA.iphoneChrome)).toBe('iPhone · Chrome');
    });

    it('prefers iPad over Macintosh when a UA claims both', () => {
      expect(deviceLabelFrom(UA.ipadDesktopMode)).toBe('iPad · Safari');
    });
  });

  // The distinction matters when reading the log: null is "the request
  // told us nothing", UNKNOWN is "it told us something we can't place".
  describe('the two kinds of not-knowing', () => {
    it('returns null when there is no header at all', () => {
      expect(deviceLabelFrom(null)).toBeNull();
      expect(deviceLabelFrom(undefined)).toBeNull();
      expect(deviceLabelFrom('')).toBeNull();
      expect(deviceLabelFrom('   ')).toBeNull();
    });

    it('returns Unknown device for a UA it cannot place, e.g. a script', () => {
      expect(deviceLabelFrom(UA.curl)).toBe('Unknown device');
    });

    it('half-recognises rather than giving up', () => {
      // A platform with no known browser, and vice versa. Support can
      // still use "an Android something" — better than Unknown device.
      expect(deviceLabelFrom('Mozilla/5.0 (Linux; Android 13)')).toBe('Android · Unknown');
      expect(deviceLabelFrom('SomeBot Firefox/1.0')).toBe('Unknown · Firefox');
    });
  });

  it('never returns a label containing a raw user-agent', () => {
    // The point of a label is that it is OUR vocabulary, not the
    // caller's string. A UA echoed into the column would be the
    // fingerprint this design declined to store.
    const evil = 'Mozilla/5.0 (Linux; Android 13; <script>alert(1)</script>) Chrome/120';
    expect(deviceLabelFrom(evil)).toBe('Android · Chrome');
  });
});
