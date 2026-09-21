using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using UBee.App.Models;

namespace UBee.App.Services;

public sealed class ApiClient : IApiClient
{
    private readonly HttpClient _http;
    private readonly IAppConfiguration _config;
    private readonly IAuthService _auth;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly SemaphoreSlim RefreshLock = new(1, 1);

    public ApiClient(HttpClient http, IAppConfiguration config, IAuthService auth)
    {
        _http = http;
        _config = config;
        _auth = auth;
        _http.BaseAddress = new Uri(_config.ApiBaseUrl);
        _http.Timeout = TimeSpan.FromSeconds(30);
    }

    public Task<ApiResult<T>> GetAsync<T>(string endpoint, CancellationToken ct = default) => SendAsync<T>(HttpMethod.Get, endpoint, null, ct);
    public Task<ApiResult<TResponse>> PostAsync<TRequest, TResponse>(string endpoint, TRequest body, CancellationToken ct = default, string? idempotencyKey = null)
        => SendAsync<TResponse>(HttpMethod.Post, endpoint, body, ct, idempotencyKey);

    private async Task<ApiResult<T>> SendAsync<T>(HttpMethod method, string endpoint, object? body, CancellationToken ct, string? idempotencyKey = null, bool retryAfterRefresh = true)
    {
        try
        {
            using var request = new HttpRequestMessage(method, endpoint);
            if (body is not null)
                request.Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json");
            if (!string.IsNullOrWhiteSpace(idempotencyKey)) request.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);
            await AddBearerAsync(request);

            using var response = await _http.SendAsync(request, ct);
            var raw = await response.Content.ReadAsStringAsync(ct);

            if (response.StatusCode == HttpStatusCode.Unauthorized && retryAfterRefresh && await TryRefreshAsync(ct))
                return await SendAsync<T>(method, endpoint, body, ct, idempotencyKey, false);

            if (!response.IsSuccessStatusCode)
                return ApiResult<T>.Fail(ParseMessage(raw) ?? $"Request failed ({(int)response.StatusCode}).", "http_error", (int)response.StatusCode);

            if (typeof(T) == typeof(object) || string.IsNullOrWhiteSpace(raw)) return ApiResult<T>.Ok(default!);
            var data = JsonSerializer.Deserialize<T>(raw, JsonOptions);
            return data is null ? ApiResult<T>.Fail("The server returned an empty response.", "empty_response", (int)response.StatusCode) : ApiResult<T>.Ok(data);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return ApiResult<T>.Fail("The request timed out. Check your connection and try again.", "timeout");
        }
        catch (HttpRequestException)
        {
            return ApiResult<T>.Fail("Unable to reach U-BEE right now. Check your internet connection.", "network_error");
        }
        catch (Exception)
        {
            return ApiResult<T>.Fail("Something went wrong while processing the request.", "client_error");
        }
    }

    private async Task AddBearerAsync(HttpRequestMessage request)
    {
        var token = await _auth.GetAccessTokenAsync();
        if (!string.IsNullOrWhiteSpace(token)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.TryAddWithoutValidation("X-Device-Info", $"U-BEE MAUI; {DeviceInfo.Platform}; {DeviceInfo.VersionString}");
    }

    private async Task<bool> TryRefreshAsync(CancellationToken ct)
    {
        await RefreshLock.WaitAsync(ct);
        try
        {
            var refresh = await _auth.GetRefreshTokenAsync();
            if (string.IsNullOrWhiteSpace(refresh)) return false;
            return await _auth.RefreshAsync(refresh, ct);
        }
        finally { RefreshLock.Release(); }
    }

    private static string? ParseMessage(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.TryGetProperty("message", out var m)) return m.GetString();
            if (doc.RootElement.TryGetProperty("error", out var e)) return e.GetString();
        }
        catch { }
        return null;
    }
}
