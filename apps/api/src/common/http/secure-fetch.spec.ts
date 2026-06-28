import { SecureFetchError, secureFetch } from './secure-fetch';

describe('secureFetch SSRF guards', () => {
  it('refuses non-https schemes', async () => {
    await expect(secureFetch('http://example.com')).rejects.toBeInstanceOf(SecureFetchError);
    await expect(secureFetch('file:///etc/passwd')).rejects.toBeInstanceOf(SecureFetchError);
    await expect(secureFetch('ftp://example.com')).rejects.toBeInstanceOf(SecureFetchError);
  });

  it('refuses an obviously invalid URL', async () => {
    await expect(secureFetch('not-a-url')).rejects.toBeInstanceOf(SecureFetchError);
  });

  it('refuses literal private IPv4 addresses', async () => {
    await expect(secureFetch('https://127.0.0.1/')).rejects.toThrow(/private/);
    await expect(secureFetch('https://10.0.0.5/')).rejects.toThrow(/private/);
    await expect(secureFetch('https://192.168.1.1/')).rejects.toThrow(/private/);
    await expect(secureFetch('https://169.254.169.254/')).rejects.toThrow(/private/);
    await expect(secureFetch('https://172.16.5.5/')).rejects.toThrow(/private/);
  });

  it('refuses link-local + loopback IPv6', async () => {
    await expect(secureFetch('https://[::1]/')).rejects.toThrow(/private/);
    await expect(secureFetch('https://[fe80::1]/')).rejects.toThrow(/private/);
    await expect(secureFetch('https://[fc00::1]/')).rejects.toThrow(/private/);
  });
});
