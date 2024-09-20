import { Event } from '@jtjs/event';

export enum HttpProtocol {
  Http = 'http',
  Https = 'https',
}

export interface BasicHttpRequestData<
  RawResponseBodyType,
  ParsedResponseBodyType,
  HttpRequestOptions
> {
  body?: any;
  options?: Omit<HttpRequestOptions, 'method' | 'body'>;
  responseBodyParser?: (
    body: RawResponseBodyType
  ) => Promise<ParsedResponseBodyType> | ParsedResponseBodyType;
  /**
   * Whether the network operation is allowed to throw. By default, all network errors are caught and passed to
   * listeners of the `onError` event of the HTTP client implementation. If this is `true`, the implementation should
   * still catch errors to invoke the `onError` event, but afterwards should throw the error back.
   */
  allowThrow?: boolean;
}

export interface BasicHttpResponseData<ParsedResponseBodyType> {
  /**
   * The raw received response.
   * 
   * Can be undefined if a network error prevented the request from being fulfilled.
   */
  response?: Response;
  /**
   * The parsed body. How the body is parsed depends on the HTTP client implementation. 
   * 
   * Can be undefined if a network error prevented the request from being fulfilled.
   */
  body?: ParsedResponseBodyType;
}

export type SendRequestHandler<T> = (request: T) => void;
export type ReceiveResponseHandler<T> = (response: T) => void;
export type NetworkErrorHandler = (error: Error) => void;

export interface IHttpClient<
  HttpRequestOptionsType,
  RequestType,
  ResponseType,
  RawResponseBodyType
> {
  /**
   * Triggered just before a request is sent.
   */
  onSendRequest: Event<SendRequestHandler<RequestType>>;
  /**
   * Triggered when a response is received.
   */
  onReceiveResponse: Event<ReceiveResponseHandler<ResponseType>>;
  /**
   * Triggered on a general network error. Does not occur on non-200 series responses.
   */
  onError: Event<NetworkErrorHandler>;

  /**
   * A default protocol and domain to use for the instance. It will be prepended to all request URIs if
   * given during construction.
   *
   * @example
   * ```javascript
   * 'https://my.site.com/'
   * 'http://my.site.com'
   * ```
   */
  protocol?: string;
  /**
   * Default options to include in all requests this client makes. Each option should be overrideable if
   * the same option is defined in the provided options when making a request.
   */
  defaultRequestOptions?: Partial<HttpRequestOptionsType>;

  /**
   * Perform a request with the specified method. Useful if the convenience functions don't provide the HTTP verb you need.
   *
   * @param method - The HTTP method to use.
   * @param uri - The URI to send the request to.
   * @param requestData - Additional information to put on the request.
   *
   * @returns A promise that resolves to response data. The properties of the returned object may be undefined if a fetch
   * error occurred during processing. To globally address fetch errors made by this client, use the `onFetchError` event.
   * To address errors for individual requests, use the `allowThrow` option on the request and handle it via try/catch.
   */
  makeRequest<ParsedBodyType = undefined>(
    method: string,
    uri: string,
    requestData?: BasicHttpRequestData<
      RawResponseBodyType,
      ParsedBodyType,
      HttpRequestOptionsType
    >
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>>;

  /**
   * Convenience function for sending a GET request.
   *
   * @param uri - The URI to send the request to.
   * @param requestData - Additional information to put on the request.
   *
   * @returns A promise that resolves to response data. The properties of the returned object may be undefined if a fetch
   * error occurred during processing. To globally address fetch errors made by this client, use the `onFetchError` event.
   * To address errors for individual requests, use the `allowThrow` option on the request and handle it via try/catch.
   */
  get<ParsedBodyType = any>(
    uri: string,
    requestData?: Omit<
      BasicHttpRequestData<
        RawResponseBodyType,
        ParsedBodyType,
        HttpRequestOptionsType
      >,
      'body'
    >
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>>;

  /**
   * Convenience function for sending a POST request.
   *
   * @param uri - The URI to send the request to.
   * @param requestData - Additional information to put on the request.
   *
   * @returns A promise that resolves to response data. The properties of the returned object may be undefined if a fetch
   * error occurred during processing. To globally address fetch errors made by this client, use the `onFetchError` event.
   * To address errors for individual requests, use the `allowThrow` option on the request and handle it via try/catch.
   */
  post<ParsedBodyType = undefined>(
    uri: string,
    requestData?: BasicHttpRequestData<
      RawResponseBodyType,
      ParsedBodyType,
      HttpRequestOptionsType
    >
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>>;

  /**
   * Convenience function for sending a PUT request.
   *
   * @param uri - The URI to send the request to.
   * @param requestData - Additional information to put on the request.
   *
   * @returns A promise that resolves to response data. The properties of the returned object may be undefined if a fetch
   * error occurred during processing. To globally address fetch errors made by this client, use the `onFetchError` event.
   * To address errors for individual requests, use the `allowThrow` option on the request and handle it via try/catch.
   */
  put<ParsedBodyType = undefined>(
    uri: string,
    requestData?: BasicHttpRequestData<
      RawResponseBodyType,
      ParsedBodyType,
      HttpRequestOptionsType
    >
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>>;

  /**
   * Convenience function for sending a PATCH request.
   *
   * @param uri - The URI to send the request to.
   * @param requestData - Additional information to put on the request.
   *
   * @returns A promise that resolves to response data. The properties of the returned object may be undefined if a fetch
   * error occurred during processing. To globally address fetch errors made by this client, use the `onFetchError` event.
   * To address errors for individual requests, use the `allowThrow` option on the request and handle it via try/catch.
   */
  patch<ParsedBodyType = undefined>(
    uri: string,
    requestData?: BasicHttpRequestData<
      RawResponseBodyType,
      ParsedBodyType,
      HttpRequestOptionsType
    >
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>>;

  /**
   * Convenience function for sending a DELETE request.
   *
   * @param uri - The URI to send the request to.
   * @param requestData - Additional information to put on the request.
   *
   * @returns A promise that resolves to response data. The properties of the returned object may be undefined if a fetch
   * error occurred during processing. To globally address fetch errors made by this client, use the `onFetchError` event.
   * To address errors for individual requests, use the `allowThrow` option on the request and handle it via try/catch.
   */
  delete<ParsedBodyType = undefined>(
    uri: string,
    requestData?: BasicHttpRequestData<
      RawResponseBodyType,
      ParsedBodyType,
      HttpRequestOptionsType
    >
  ): Promise<Partial<BasicHttpResponseData<ParsedBodyType>>>;
}
