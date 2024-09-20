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
  protocol?: HttpProtocol;
  host?: string;
  /**
   * Should begin with a `/`.
   */
  path?: string;
  defaultRequestOptions?: Omit<RequestInit, 'method'>;
}

type FetchRawResponseBody = ReadableStream<Uint8Array> | null;

/**
 * Default implementation for an HTTP(S) client that uses the fetch API. Any kind of body can be given, but this implementation
 * has a preference toward JSON. If no `Content-Type` is included on a request's header, `application/json`
 * is assumed and the body will be stringified accordingly. If the 'Content-Type' is included, the `Accept` header
 * is auto-populated to prefer the same content type, with a secondary preference for anything.
 *
 * When parsing the response's body, the provided `responseBodyParser` is always preferred if supplied. If it's not,
 * the request's `Content-Type` is observed. If it's JSON, it's parsed as JSON. Otherwise it's parsed as text.
 */
export class FetchHttpClient
  implements IHttpClient<RequestInit, Request, Response, FetchRawResponseBody>
{
  onSendRequest = new Event<SendRequestHandler<Request>>();
  onReceiveResponse = new Event<ReceiveResponseHandler<Response>>();
  onError = new Event<NetworkErrorHandler>();

  protected static URI_REGEX =
    /^(?<uri>(?:(?<protocol>[a-z]+):\/\/)?(?<host>[a-z\d.]+)?(?<path>\/.*)?)$/i;

  protected _protocol = HttpProtocol.Http;
  public get protocol(): HttpProtocol {
    return this._protocol;
  }

  protected _host = '';
  public get host(): string {
    return this._host;
  }

  protected _path = '';
  public get path(): string {
    return this._path;
  }

  protected _defaultRequestOptions = {};
  public get defaultRequestOptions(): Partial<RequestInit> | undefined {
    return this._defaultRequestOptions;
  }

  constructor(options: FetchHttpClientOptions = {}) {
    const { protocol, host, path, defaultRequestOptions } = options;

    if (path && !path.startsWith('/')) {
      throw new Error(
        `Could not create FetchHttpClient. Provided path "${path}" does not start with a "/".`
      );
    }

    this._protocol = protocol ?? HttpProtocol.Http;
    this._host = host ?? '';
    this._path = path ?? '';
    this._defaultRequestOptions = defaultRequestOptions ?? {};
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
          treatedUri += `${this._protocol ?? HttpProtocol.Http}://${
            this._host
          }`;
        }

        treatedUri += `${this._path ?? ''}${path ?? ''}`;
      } else {
        treatedUri += `${protocol ?? this._protocol ?? HttpProtocol.Http}://${
          host ?? this._host ?? ''
        }${this._path ?? ''}${path ?? ''}`;
      }
    }

    return treatedUri;
  }

  async makeRequest<ParsedBodyType = undefined>(
    method: string,
    uri: string,
    requestData: BasicHttpRequestData<
      FetchRawResponseBody,
      ParsedBodyType,
      RequestInit
    > = {}
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>> {
    const { options, body, responseBodyParser, allowThrow } = requestData;

    const headers = new Headers({
      ...this.#getNormalizedHeaders(this.defaultRequestOptions?.headers),
      ...this.#getNormalizedHeaders(requestData?.options?.headers),
    });

    const contentTypeHeader = headers.get('content-type');
    const isContentTypePresent = !!contentTypeHeader;
    let isJsonRequest =
      (!isContentTypePresent ||
        contentTypeHeader.toLowerCase() === 'application/json') &&
      !!body;

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
        body: isJsonRequest
          ? JSON.stringify(body as Record<string, any>)
          : (body as BodyInit),
      };

      this.onSendRequest.trigger({
        url: requestUri,
        ...requestOptions,
      } as Request);

      const response = await fetch(
        `${this._getTreatedUri(uri)}`,
        requestOptions
      );

      this.onReceiveResponse.trigger(response);

      let defaultBodyParser;
      if (
        response?.headers?.get('content-type')?.includes('application/json')
      ) {
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
    requestData?: Omit<
      BasicHttpRequestData<FetchRawResponseBody, ParsedBodyType, RequestInit>,
      'body'
    >
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>> {
    return this.makeRequest('GET', uri, requestData);
  }

  post<ParsedBodyType = undefined>(
    uri: string,
    requestData?: BasicHttpRequestData<
      FetchRawResponseBody,
      ParsedBodyType,
      RequestInit
    >
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>> {
    return this.makeRequest('POST', uri, requestData);
  }

  put<ParsedBodyType = undefined>(
    uri: string,
    requestData?: BasicHttpRequestData<
      FetchRawResponseBody,
      ParsedBodyType,
      RequestInit
    >
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>> {
    return this.makeRequest('PUT', uri, requestData);
  }

  patch<ParsedBodyType = undefined>(
    uri: string,
    requestData?: BasicHttpRequestData<
      FetchRawResponseBody,
      ParsedBodyType,
      RequestInit
    >
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>> {
    return this.makeRequest('PATCH', uri, requestData);
  }

  delete<ParsedBodyType = undefined>(
    uri: string,
    requestData?: BasicHttpRequestData<
      FetchRawResponseBody,
      ParsedBodyType,
      RequestInit
    >
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

/**
 * A default instance of {@link FetchHttpClient} for ease of use if you don't want to make an instance whenever you need
 * to make a request. This instance has no defaults specified.
 */
export const FetchService = new FetchHttpClient();
