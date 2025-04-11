import fetch from 'cross-fetch';
import { afterEach, beforeEach, describe, expect, Mock, test, vi } from 'vitest';
import { FetchHttpClient, FetchService } from '../fetch-http-client.impl';
import { HttpProtocol } from '../http-client.interface';

const mockFetch = fetch as Mock;

const protocol = HttpProtocol.Http;
const host = 'google.com';
const uri = `${protocol}://${host}`;

vi.mock(import('cross-fetch'), async (importOriginal) => {
  const original = await importOriginal();

  return {
    ...original,
    default: vi.fn(() => Promise.resolve(new Response())),
  };
});

class MockResponseObject {
  constructor(public body: any, public headers: any) {}

  text() {
    return Promise.resolve(JSON.stringify(this.body));
  }

  json() {
    return this.text().then(JSON.parse);
  }
}

describe('FetchHttpClient', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('throws error when trying to create a client with a path that does not start with a /', () => {
    expect(() => {
      new FetchHttpClient({
        path: 'api',
      });
    }).toThrow();
  });

  describe('getTreatedUri', () => {
    test('includes the default protocol, host, and path when they exist', () => {
      const httpClient = new FetchHttpClient({ protocol, host, path: '/api' });

      // @ts-ignore
      expect(httpClient._getTreatedUri('/some/endpoint')).toBe('http://google.com/api/some/endpoint');
    });
    test(`does not include the default protocol, host, and path when they don't exist`, () => {
      const httpClient = new FetchHttpClient();

      // @ts-ignore
      expect(httpClient._getTreatedUri('/relative-endpoint')).toBe('/relative-endpoint');
      // @ts-ignore
      expect(httpClient._getTreatedUri('https://my.site.com')).toBe('https://my.site.com');
    });
    test(`includes the default protocol correctly when it's provided`, () => {
      const httpClient = new FetchHttpClient({
        protocol: HttpProtocol.Https,
      });

      // @ts-ignore
      expect(httpClient._getTreatedUri('/somewhere')).toBe('/somewhere');
      // @ts-ignore
      expect(httpClient._getTreatedUri(`${host}/somewhere`)).toBe(`https://${host}/somewhere`);
      // @ts-ignore
      expect(httpClient._getTreatedUri(`http://${host}/somewhere`)).toBe(`http://${host}/somewhere`);
    });
    test(`includes the default host correctly when it's provided`, () => {
      const httpClient = new FetchHttpClient({
        host,
      });

      // @ts-ignore
      expect(httpClient._getTreatedUri('/somewhere')).toBe(`http://${host}/somewhere`);
      expect(
        // @ts-ignore
        httpClient._getTreatedUri(`unluckycricketgames.com/somewhere`)
      ).toBe(`http://unluckycricketgames.com/somewhere`);
      expect(
        // @ts-ignore
        httpClient._getTreatedUri(`https://unluckycricketgames.com/somewhere`)
      ).toBe(`https://unluckycricketgames.com/somewhere`);
    });
    test(`includes the path correctly when it's provided`, () => {
      const httpClient = new FetchHttpClient({
        path: '/api',
      });

      // @ts-ignore
      expect(httpClient._getTreatedUri('/somewhere')).toBe(`/api/somewhere`);
      expect(
        // @ts-ignore
        httpClient._getTreatedUri(`unluckycricketgames.com/somewhere`)
      ).toBe(`http://unluckycricketgames.com/api/somewhere`);
      expect(
        // @ts-ignore
        httpClient._getTreatedUri(`https://unluckycricketgames.com/somewhere`)
      ).toBe(`https://unluckycricketgames.com/api/somewhere`);
    });
    test(`includes the protocol and host correctly when they're both provided`, () => {
      const httpClient = new FetchHttpClient({
        protocol: HttpProtocol.Https,
        host,
      });

      // @ts-ignore
      expect(httpClient._getTreatedUri('')).toBe('https://google.com');
      // @ts-ignore
      expect(httpClient._getTreatedUri(`${host}/somewhere`)).toBe(`https://${host}/somewhere`);
      // @ts-ignore
      expect(httpClient._getTreatedUri(`http://${host}/somewhere`)).toBe(`http://${host}/somewhere`);
    });
    test(`includes the protocol and path correctly when they're both provided`, () => {
      const httpClient = new FetchHttpClient({
        protocol: HttpProtocol.Https,
        path: '/private/api',
      });

      // @ts-ignore
      expect(httpClient._getTreatedUri(host)).toBe('https://google.com/private/api');
      // @ts-ignore
      expect(httpClient._getTreatedUri(`${host}/somewhere`)).toBe(`https://${host}/private/api/somewhere`);
      // @ts-ignore
      expect(httpClient._getTreatedUri(`http://${host}/somewhere`)).toBe(`http://${host}/private/api/somewhere`);
    });
    test(`includes the host and path correctly when they're both provided`, () => {
      const httpClient = new FetchHttpClient({
        host,
        path: '/api',
      });

      // @ts-ignore
      expect(httpClient._getTreatedUri('')).toBe(`http://${host}/api`);
      // @ts-ignore
      expect(httpClient._getTreatedUri(`gmail.com/somewhere`)).toBe(`http://gmail.com/api/somewhere`);
      // @ts-ignore
      expect(httpClient._getTreatedUri(`https://gmail.com/somewhere`)).toBe(`https://gmail.com/api/somewhere`);
    });
  });

  describe('makeRequest', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    describe('Content-Type absent', () => {
      test(`works when no body is provided. No Content-Type is included.`, () => {
        FetchService.makeRequest('GET', uri);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(uri, {
          method: 'GET',
          headers: {
            accept: '*/*',
          },
        });
      });
      test(`can give a body and it'll send it`, () => {
        const body = {
          prop: 1,
        };

        FetchService.makeRequest('POST', uri, {
          body,
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(uri, {
          method: 'POST',
          headers: {
            accept: 'application/json, */*;q=0.9',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      });
    });
    describe('Content-Type present', () => {
      test(`uses the provided Content-Type`, () => {
        const body = 'something';

        FetchService.makeRequest('POST', uri, {
          body,
          options: {
            headers: {
              'content-type': 'text/plain',
            },
          },
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(uri, {
          method: 'POST',
          headers: {
            accept: 'text/plain, */*;q=0.9',
            'content-type': 'text/plain',
          },
          body,
        });
      });
      test(`uses the provided Content-Type even when the actual content differs`, () => {
        const body = 'something';

        FetchService.makeRequest('POST', uri, {
          body,
          options: {
            headers: {
              'content-type': 'application/xml',
            },
          },
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(uri, {
          method: 'POST',
          headers: {
            accept: 'application/xml, */*;q=0.9',
            'content-type': 'application/xml',
          },
          body,
        });
      });
      describe('response body parsing', () => {
        test('parses the body correctly when the response Content-Type is JSON', async () => {
          const body = {
            prop: 1,
          };

          mockFetch.mockResolvedValueOnce(
            Promise.resolve({
              body: JSON.stringify(body),
              json: () => Promise.resolve(body),
              headers: new Headers({
                'content-type': 'application/json',
              }),
            })
          );

          const result = await FetchService.makeRequest('POST', uri, {
            body,
          });

          expect(result.body).toEqual(body);
        });
        test(`parses the body correctly when the response Content-Type is JSON and there's extra information in the header`, async () => {
          const body = {
            prop: 1,
          };

          mockFetch.mockResolvedValueOnce(
            Promise.resolve({
              body: JSON.stringify(body),
              json: () => Promise.resolve(body),
              headers: new Headers({
                'content-type': 'application/json; charset=utf-8',
              }),
            })
          );

          const result = await FetchService.makeRequest('POST', uri, {
            body,
          });

          expect(result.body).toEqual(body);
        });
        test(`parses the body as text when the response Content-Type is not JSON and there's no parser provided`, async () => {
          const requestBody = {
            prop: 1,
          };

          const xmlString = '<something>node</something>';

          mockFetch.mockResolvedValueOnce(
            Promise.resolve({
              body: xmlString,
              text: () => Promise.resolve(xmlString),
              headers: new Headers({
                'content-type': 'application/xml',
              }),
            })
          );

          const result = await FetchService.makeRequest('POST', uri, {
            body: requestBody,
          });

          expect(result.body).toEqual(xmlString);
        });
        test(`parses the body using the provided body parser when it's provided and the response Content-Type isn't JSON`, async () => {
          const requestBody = {
            prop: 1,
          };

          const htmlParsed = '<p>Hello World!</p>';

          mockFetch.mockResolvedValueOnce(
            Promise.resolve({
              // Base-64 encode so I can be sure it's not just grabbing the bare body and is actually applying
              // the parser.
              body: btoa(htmlParsed),
              headers: new Headers({
                'content-type': 'text/html',
              }),
            })
          );

          const result = await FetchService.makeRequest<string>('POST', uri, {
            body: requestBody,
            responseBodyParser: (test) => htmlParsed,
          });

          expect(result.body).toEqual(htmlParsed);
        });
        test(`parses the body using the provided body parser when it's provided and the response Content-Type is JSON`, async () => {
          const requestBody = {
            prop: 1,
          };

          const responseBody = {
            prop1: 'value',
            prop2: 'something',
          };

          mockFetch.mockResolvedValueOnce(
            Promise.resolve({
              // Base-64 encode so I can be sure it's not just grabbing the bare body and is actually applying
              // the parser.
              body: JSON.stringify(responseBody),
              headers: new Headers({
                'content-type': 'application/json',
              }),
            })
          );

          const result = await FetchService.makeRequest('POST', uri, {
            body: requestBody,
            // Pretend parser grabs just the first property's value
            responseBodyParser: () => {
              return 'value';
            },
          });

          expect(result.body).toEqual('value');
        });
        test(`parses the body correctly when the json method on the response object tries to use 'this'`, async () => {
          const body = {
            prop: 1,
          };

          mockFetch.mockResolvedValueOnce(
            Promise.resolve(
              new MockResponseObject(
                body,
                new Headers({
                  'content-type': 'application/json',
                })
              )
            )
          );

          const result = await FetchService.makeRequest('POST', uri, {
            body,
          });

          expect(result.body).toEqual(body);
        });
      });
    });
    describe('default protocol and host', () => {
      test(`includes the default protocol and domain when one exists`, () => {
        const httpClient = new FetchHttpClient({ protocol, host });

        httpClient.makeRequest('GET', '/something');

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(`${uri}/something`, {
          method: 'GET',
          headers: {
            accept: '*/*',
          },
        });
      });
      test(`does not prepend anything when there is no default`, () => {
        const httpClient = new FetchHttpClient();

        httpClient.makeRequest('GET', '/something');

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(`/something`, {
          method: 'GET',
          headers: {
            accept: '*/*',
          },
        });
      });
    });
    describe('defaultRequestOptions', () => {
      test(`includes default options`, async () => {
        const client = new FetchHttpClient({
          defaultRequestOptions: {
            headers: {
              authorization: '1234',
              'x-powered-by': 'jtjs',
            },
          },
        });

        await client.get(uri);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(uri, {
          method: 'GET',
          headers: {
            authorization: '1234',
            'x-powered-by': 'jtjs',
            accept: '*/*',
          },
        });
      });
      test(`provided options override individual default options with the same key`, async () => {
        const client = new FetchHttpClient({
          defaultRequestOptions: {
            headers: {
              authorization: '1234',
              'x-powered-by': 'jtjs',
            },
          },
        });

        await client.get(uri, {
          options: {
            headers: {
              authorization: 'blah',
            },
          },
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(uri, {
          method: 'GET',
          headers: {
            authorization: 'blah',
            'x-powered-by': 'jtjs',
            accept: '*/*',
          },
        });
      });
    });
    describe('throws errors properly', () => {
      beforeEach(() => {
        mockFetch.mockRejectedValueOnce(new Error('Big bad network error!'));
      });

      test(`does not throw when allowThrow was not included in the request data`, () => {
        expect(async () => {
          await FetchService.get(uri);
        }).not.toThrow();
      });
      test(`does not throw when allowThrow was false in the request data`, () => {
        expect(async () => {
          await FetchService.get(uri, {
            allowThrow: false,
          });
        }).not.toThrow();
      });
      test(`throws when allowThrow was true in the request data`, async () => {
        await expect(async () => {
          await FetchService.get(uri, {
            allowThrow: true,
          });
        }).rejects.toThrow('Big bad network error!');
      });
    });
    describe('events', () => {
      test(`invokes onSendRequest when a request is made`, async () => {
        const handleSendRequest = vi.fn();

        const client = new FetchHttpClient();
        client.onSendRequest.subscribe(handleSendRequest);

        await client.get(uri);

        expect(handleSendRequest).toHaveBeenCalledTimes(1);
      });
      test(`invokes onReceiveResponse when a response comes back`, async () => {
        const handleReceiveResponse = vi.fn();

        const client = new FetchHttpClient();
        client.onReceiveResponse.subscribe(handleReceiveResponse);

        await client.get(uri);

        expect(handleReceiveResponse).toHaveBeenCalledTimes(1);
      });
      test(`invokes onError when the operation encounters a network error`, async () => {
        mockFetch.mockRejectedValueOnce(new Error('Boom!'));

        const handleError = vi.fn();

        const client = new FetchHttpClient();
        client.onError.subscribe(handleError);

        await client.get(uri);

        expect(handleError).toHaveBeenCalledTimes(1);
        expect(handleError).toHaveBeenCalledWith(new Error('Boom!'));
      });
      test(`invokes onError even when allowThrow was enabled on the request data`, async () => {
        mockFetch.mockRejectedValueOnce(new Error('Boom!'));

        const handleError = vi.fn();

        const client = new FetchHttpClient();
        client.onError.subscribe(handleError);

        try {
          await client.get(uri, {
            allowThrow: true,
          });
        } catch (error) {}

        expect(handleError).toHaveBeenCalledTimes(1);
        expect(handleError).toHaveBeenCalledWith(new Error('Boom!'));
      });
    });
  });

  describe('rate limiting', () => {
    test(`a new request is not made if sufficient time hasn't passed`, async () => {
      const http = new FetchHttpClient({
        rateLimitMs: 1_000,
      });

      const promises = [http.get('/somewhere'), http.get('/another-place'), http.get('/somewhere/else')];

      expect(mockFetch).toHaveBeenCalledTimes(1);

      await Promise.all(promises);
    });
    test(`requests are made in the order received`, async () => {
      const http = new FetchHttpClient({
        rateLimitMs: 50,
      });

      await Promise.all([http.get('/somewhere'), http.get('/another-place'), http.get('/somewhere/else')]);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[0][0]).toBe('/somewhere');
      expect(mockFetch.mock.calls[1][0]).toBe('/another-place');
      expect(mockFetch.mock.calls[2][0]).toBe('/somewhere/else');
    });

    describe('no limiting...', () => {
      test(`on first request`, async () => {
        const http = new FetchHttpClient({
          rateLimitMs: 50,
        });

        http.get('/somewhere');

        expect(mockFetch).toHaveBeenCalledTimes(1);

        http.get('/somewhere');

        // Not called again because it should be waiting to make the call.
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
      test(`when there is no configured rate limit`, async () => {
        const http = new FetchHttpClient();

        http.get('/somewhere');

        expect(mockFetch).toHaveBeenCalledTimes(1);

        http.get('/somewhere');
       
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('convenience methods', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    test('convenience methods invoke fetch with the expected method', () => {
      FetchService.get(uri);
      FetchService.put(uri);
      FetchService.post(uri);
      FetchService.patch(uri);
      FetchService.delete(uri);

      expect(mockFetch).toHaveBeenNthCalledWith(1, uri, {
        method: 'GET',
        headers: {
          accept: '*/*',
        },
      });
      expect(mockFetch).toHaveBeenNthCalledWith(2, uri, {
        method: 'PUT',
        headers: {
          accept: '*/*',
        },
      });
      expect(mockFetch).toHaveBeenNthCalledWith(3, uri, {
        method: 'POST',
        headers: {
          accept: '*/*',
        },
      });
      expect(mockFetch).toHaveBeenNthCalledWith(4, uri, {
        method: 'PATCH',
        headers: {
          accept: '*/*',
        },
      });
      expect(mockFetch).toHaveBeenNthCalledWith(5, uri, {
        method: 'DELETE',
        headers: {
          accept: '*/*',
        },
      });
    });
  });
});
