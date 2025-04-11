import { Event } from '@jtjs/event';
import fetch, { Headers } from 'cross-fetch';
import {
  BasicHttpRequestData,
  BasicHttpResponseData,
  HttpProtocol,
  IHttpClient,
  NetworkErrorHandler,
  ReceiveResponseHandler,
  SendRequestHandler,
} from './http-client.interface';

export interface FetchHttpClientOptions {
  /**
   * The HTTP protocol that the client uses.
   *
   * Defaults to HTTP.
   */
  protocol?: HttpProtocol;
  /**
   * The host that will always used for this client. The host is the
   * domain + TLD.
   *
   * Defaults to an empty string (i.e., no default host).
   *
   * @example
   * ```ts
   * host: 'api.somecoolsite.com'
   * ```
   */
  host?: string;
  /**
   * The path that will be appended to all requests this client makes.
   *
   * Should begin with a `/`.
   *
   * Defaults to an empty string (i.e., no base path).
   *
   * @example
   * ```ts
   * path: '/base/path/for/calls'
   * ```
   */
  path?: string;
  defaultRequestOptions?: Omit<RequestInit, 'method'>;
  /**
   * The minimum amount of time that must pass between requests
   * this client makes. This can be useful for limiting this client
   * in accordance with an API's restrictions.
   *
   * If a request is made before this time has elapsed, the client
   * will wait to make the request. The client may wait longer than
   * this value, but will not wait any less than this value. 
   * 
   * Values less than `10` will not be accurate. When limited, the client
   * won't make requests any faster than at least 10ms apart. If you need 
   * less than 10ms between calls, it's unlikely you need a rate limit.
   * 
   * If multiple requests are initiated during the waiting period, they
   * will be queued and executed in the order they were received.
   *
   * Use this only when required. A call may have to wait a significant
   * amount of time if you have a long wait time and are frequently
   * making requests.
   *
   * Defaults to no limit.
   */
  rateLimitMs?: number;
}

type FetchRawResponseBody = ReadableStream<Uint8Array> | null;

function waitFor(predicate: () => boolean, checkTimeMs = 10): Promise<void> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);

        resolve(undefined);
      }
    }, checkTimeMs);
  });
}

/**
 * Default implementation for an HTTP(S) client that uses the fetch API. Any kind of body can be given, but this implementation
 * has a preference toward JSON. If no `Content-Type` is included on a request's header, `application/json`
 * is assumed and the body will be stringified accordingly. If the 'Content-Type' is included, the `Accept` header
 * is auto-populated to prefer the same content type, with a secondary preference for anything.
 *
 * When parsing the response's body, the provided `responseBodyParser` is always preferred if supplied. If it's not,
 * the request's `Content-Type` is observed. If it's JSON, it's parsed as JSON. Otherwise it's parsed as text.
 */
export class FetchHttpClient implements IHttpClient<RequestInit, Request, Response, FetchRawResponseBody> {
  protected static URI_REGEX = /^(?<uri>(?:(?<protocol>[a-z]+):\/\/)?(?<host>[a-z\d.]+)?(?<path>\/.*)?)$/i;

  onSendRequest = new Event<SendRequestHandler<Request>>();
  onReceiveResponse = new Event<ReceiveResponseHandler<Response>>();
  onError = new Event<NetworkErrorHandler>();

  #timeOfLastRequest = 0;
  #requestQueue = new RequestQueue();

  protected _protocol = HttpProtocol.Http;
  get protocol(): HttpProtocol {
    return this._protocol;
  }

  protected _host = '';
  get host(): string {
    return this._host;
  }

  protected _path = '';
  get path(): string {
    return this._path;
  }

  protected _defaultRequestOptions = {};
  get defaultRequestOptions(): Partial<RequestInit> | undefined {
    return this._defaultRequestOptions;
  }

  protected _rateLimitMs = 0;
  get rateLimitMs(): number {
    return this._rateLimitMs;
  }

  get #isRateLimited(): boolean {
    return this._rateLimitMs > 0;
  }

  get #shouldQueueRequest(): boolean {
    return this.#isRateLimited && Date.now() < this.#timeOfLastRequest + this._rateLimitMs;
  }

  constructor(options: FetchHttpClientOptions = {}) {
    const { protocol, host, path, defaultRequestOptions, rateLimitMs } = options;

    if (path && !path.startsWith('/')) {
      throw new Error(`Could not create FetchHttpClient. Provided path "${path}" does not start with a "/".`);
    }

    this._protocol = protocol ?? HttpProtocol.Http;
    this._host = host ?? '';
    this._path = path ?? '';
    this._defaultRequestOptions = defaultRequestOptions ?? {};
    this._rateLimitMs = rateLimitMs ?? 0;
  }

  protected _getTreatedUri(uri: string): string {
    const trimmedUri = uri.trim();

    const match = FetchHttpClient.URI_REGEX.exec(trimmedUri);

    let treatedUri = '';
    if (match) {
      // @ts-ignore
      const { protocol, host, path } = match.groups;

      const isRelative = !protocol && !host;

      if (isRelative) {
        if (this._host) {
          treatedUri += `${this._protocol ?? HttpProtocol.Http}://${this._host}`;
        }

        treatedUri += `${this._path ?? ''}${path ?? ''}`;
      } else {
        treatedUri += `${protocol ?? this._protocol ?? HttpProtocol.Http}://${host ?? this._host ?? ''}${
          this._path ?? ''
        }${path ?? ''}`;
      }
    }

    return treatedUri;
  }

  async makeRequest<ParsedBodyType = undefined>(
    method: string,
    uri: string,
    requestData: BasicHttpRequestData<FetchRawResponseBody, ParsedBodyType, RequestInit> = {}
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>> {
    if (this.#shouldQueueRequest) {
      const requestId = this.#requestQueue.enqueue();

      await waitFor(() => !this.#shouldQueueRequest && this.#requestQueue.peek() === requestId);

      this.#requestQueue.dequeue();
    }

    this.#timeOfLastRequest = Date.now();

    const { options, body, responseBodyParser, allowThrow } = requestData;

    const headers = new Headers({
      ...this.#getNormalizedHeaders(this.defaultRequestOptions?.headers),
      ...this.#getNormalizedHeaders(requestData?.options?.headers),
    });

    const contentTypeHeader = headers.get('content-type');
    const isContentTypePresent = !!contentTypeHeader;
    let isJsonRequest = (!isContentTypePresent || contentTypeHeader.toLowerCase() === 'application/json') && !!body;

    let contentTypeToUse = contentTypeHeader;
    if (!contentTypeToUse && isJsonRequest) {
      contentTypeToUse = 'application/json';
    }

    try {
      const requestUri = this._getTreatedUri(uri);
      const requestOptions: RequestInit = {
        ...this.defaultRequestOptions,
        ...options,
        method,
        headers: {
          accept: '*/*',
          ...this.#getNormalizedHeaders(headers),
          ...(!!contentTypeToUse
            ? {
                'content-type': contentTypeToUse,
                accept: `${contentTypeToUse}, */*;q=0.9`,
              }
            : undefined),
        },
        body: isJsonRequest ? JSON.stringify(body as Record<string, any>) : (body as BodyInit),
      };

      this.onSendRequest.trigger({
        url: requestUri,
        ...requestOptions,
      } as Request);

      const response = await fetch(`${this._getTreatedUri(uri)}`, requestOptions);

      this.onReceiveResponse.trigger(response);

      let defaultBodyParser;
      if (response?.headers?.get('content-type')?.includes('application/json')) {
        defaultBodyParser = response?.json;
      } else {
        defaultBodyParser = response?.text;
      }

      defaultBodyParser = defaultBodyParser?.bind(response);

      return {
        response,
        body: (await (!!responseBodyParser
          ? responseBodyParser(response?.body)
          : defaultBodyParser?.())) as ParsedBodyType,
      };
    } catch (error) {
      this.onError.trigger(error as Error);

      if (allowThrow) {
        throw error;
      }

      return {
        response: undefined,
        body: undefined,
      };
    }
  }

  get<ParsedBodyType = any>(
    uri: string,
    requestData?: Omit<BasicHttpRequestData<FetchRawResponseBody, ParsedBodyType, RequestInit>, 'body'>
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>> {
    return this.makeRequest('GET', uri, requestData);
  }

  post<ParsedBodyType = undefined>(
    uri: string,
    requestData?: BasicHttpRequestData<FetchRawResponseBody, ParsedBodyType, RequestInit>
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>> {
    return this.makeRequest('POST', uri, requestData);
  }

  put<ParsedBodyType = undefined>(
    uri: string,
    requestData?: BasicHttpRequestData<FetchRawResponseBody, ParsedBodyType, RequestInit>
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>> {
    return this.makeRequest('PUT', uri, requestData);
  }

  patch<ParsedBodyType = undefined>(
    uri: string,
    requestData?: BasicHttpRequestData<FetchRawResponseBody, ParsedBodyType, RequestInit>
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>> {
    return this.makeRequest('PATCH', uri, requestData);
  }

  delete<ParsedBodyType = undefined>(
    uri: string,
    requestData?: BasicHttpRequestData<FetchRawResponseBody, ParsedBodyType, RequestInit>
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>> {
    return this.makeRequest('DELETE', uri, requestData);
  }

  #getNormalizedHeaders(headers?: HeadersInit): HeadersInit {
    let normalizedHeaders: HeadersInit = {};

    if (headers) {
      if (headers instanceof Headers) {
        normalizedHeaders = Object.fromEntries(headers.entries());
      } else if (Array.isArray(headers)) {
        normalizedHeaders = Object.fromEntries(
          headers.map(([headerName, headerValue]) => {
            return [headerName.toLowerCase(), headerValue];
          })
        );
      } else {
        // Plain object
        normalizedHeaders = Object.fromEntries(
          Object.entries(headers).map(([headerName, headerValue]) => {
            return [headerName.toLowerCase(), headerValue];
          })
        );
      }
    }

    return normalizedHeaders;
  }
}

class RequestQueue {
  #nextCallId = 0;
  #queuedCalls: number[] = [];

  get isEmpty(): boolean {
    return this.#queuedCalls.length === 0;
  }

  enqueue(): number {
    const id = this.#nextCallId;

    this.#queuedCalls.push(id);

    this.#nextCallId += 1;

    return id;
  }

  dequeue(): number | undefined {
    const el = this.#queuedCalls[0];

    this.#queuedCalls = this.#queuedCalls.slice(1);

    return el;
  }

  peek(): number | undefined {
    return this.#queuedCalls[0];
  }

  remove(id: number): void {
    const indexOfId = this.#queuedCalls.indexOf(id);

    this.#queuedCalls = [...this.#queuedCalls.slice(0, indexOfId), ...this.#queuedCalls.slice(indexOfId + 1)];
  }
}

/**
 * A default instance of {@link FetchHttpClient} for ease of use if you don't want to make an instance whenever you need
 * to make a request. This instance has no defaults specified.
 */
export const FetchService = new FetchHttpClient();
