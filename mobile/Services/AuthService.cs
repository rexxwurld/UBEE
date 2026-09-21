using System.Text.Json;
using System.Net.Http.Json;
using UBee.App.Models;

namespace UBee.App.Services;

public sealed class AuthService : IAuthService
{
    private const string AccessKey = "ubee.access_token";
    private const string RefreshKey = "ubee.refresh_token";
    private readonly ISecureStorageService _secure;
    private readonly IAppConfiguration _config;
    private readonly HttpClient _rawHttp;

    public AuthService(ISecureStorageService secure, IAppConfiguration config)
    {
        _secure = secure;
        _config = config;
        _rawHttp = new HttpClient { BaseAddress = new Uri(config.ApiBaseUrl), Timeout = TimeSpan.FromSeconds(30) };
    }

    public async Task<ApiResult<LoginResponse>> LoginAsync(string email, string password, CancellationToken ct = default)
    {
        try
        {
            using var response = await _rawHttp.PostAsJsonAsync("auth/login", new LoginRequest(email, password), ct);
            var raw = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
                return ApiResult<LoginResponse>.Fail(ParseMessage(raw) ?? "Login failed.", "login_failed", (int)response.StatusCode);
            var data = JsonSerializer.Deserialize<LoginResponse>(raw, JsonDefaults.Options);
            if (data is null) return ApiResult<LoginResponse>.Fail("Invalid login response.", "invalid_response");
            if (data.MfaRequired) return ApiResult<LoginResponse>.Ok(data);
            if (!string.IsNullOrWhiteSpace(data.AccessToken) && !string.IsNullOrWhiteSpace(data.RefreshToken))
                await SaveTokensAsync(data.AccessToken!, data.RefreshToken!);
            return ApiResult<LoginResponse>.Ok(data);
        }
        catch (Exception ex) { return ApiResult<LoginResponse>.Fail(ex is HttpRequestException ? "Unable to reach U-BEE." : "Login could not be completed.", "login_error"); }
    }

    public async Task<ApiResult<UserDto>> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
        try
        {
            using var response = await _rawHttp.PostAsJsonAsync("auth/register", request, ct);
            var raw = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode) return ApiResult<UserDto>.Fail(ParseMessage(raw) ?? "Registration failed.", "registration_failed", (int)response.StatusCode);
            var wrapper = JsonSerializer.Deserialize<RegisterResponse>(raw, JsonDefaults.Options);
            return wrapper?.User is null ? ApiResult<UserDto>.Fail("Invalid registration response.", "invalid_response") : ApiResult<UserDto>.Ok(wrapper.User);
        }
        catch (Exception) { return ApiResult<UserDto>.Fail("Registration could not be completed.", "registration_error"); }
    }

    public async Task<ApiResult<UserDto>> GetMeAsync(CancellationToken ct = default)
    {
        var token = await GetAccessTokenAsync();
        if (string.IsNullOrWhiteSpace(token)) return ApiResult<UserDto>.Fail("Not signed in.", "not_authenticated", 401);
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, "auth/me");
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            using var response = await _rawHttp.SendAsync(req, ct);
            var raw = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode) return ApiResult<UserDto>.Fail(ParseMessage(raw) ?? "Session is no longer valid.", "session_invalid", (int)response.StatusCode);
            var user = JsonSerializer.Deserialize<UserDto>(raw, JsonDefaults.Options);
            return user is null ? ApiResult<UserDto>.Fail("Invalid profile response.", "invalid_response") : ApiResult<UserDto>.Ok(user);
        }
        catch (Exception) { return ApiResult<UserDto>.Fail("Could not load your profile.", "profile_error"); }
    }

    public async Task<ApiResult<LoginResponse>> VerifyMfaAsync(string challengeId, string code, CancellationToken ct = default)
    {
        try
        {
            using var response = await _rawHttp.PostAsJsonAsync("auth/login/mfa-verify", new { challengeId, code }, ct);
            var raw = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode) return ApiResult<LoginResponse>.Fail(ParseMessage(raw) ?? "OTP verification failed.", "mfa_failed", (int)response.StatusCode);
            var data = JsonSerializer.Deserialize<LoginResponse>(raw, JsonDefaults.Options);
            if (data?.AccessToken is null || data.RefreshToken is null) return ApiResult<LoginResponse>.Fail("Invalid MFA login response.", "invalid_response");
            await SaveTokensAsync(data.AccessToken, data.RefreshToken);
            return ApiResult<LoginResponse>.Ok(data);
        }
        catch { return ApiResult<LoginResponse>.Fail("OTP verification could not be completed.", "mfa_error"); }
    }

    public async Task<bool> RefreshAsync(string refreshToken, CancellationToken ct = default)
    {
        try
        {
            using var response = await _rawHttp.PostAsJsonAsync("auth/token/refresh", new RefreshRequest(refreshToken), ct);
            var raw = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode) { ClearTokens(); return false; }
            var data = JsonSerializer.Deserialize<LoginResponse>(raw, JsonDefaults.Options);
            if (data?.AccessToken is null || data.RefreshToken is null) { ClearTokens(); return false; }
            await SaveTokensAsync(data.AccessToken, data.RefreshToken);
            return true;
        }
        catch { return false; }
    }

    public Task<string?> GetAccessTokenAsync() => _secure.GetAsync(AccessKey);
    public Task<string?> GetRefreshTokenAsync() => _secure.GetAsync(RefreshKey);

    public async Task<bool> TryRestoreSessionAsync()
    {
        var refresh = await GetRefreshTokenAsync();
        if (string.IsNullOrWhiteSpace(refresh)) return false;
        if (await RefreshAsync(refresh)) return true;
        var me = await GetMeAsync();
        return me.Success;
    }

    public async Task LogoutAsync(CancellationToken ct = default)
    {
        var refresh = await GetRefreshTokenAsync();
        try { if (!string.IsNullOrWhiteSpace(refresh)) await _rawHttp.PostAsJsonAsync("auth/logout", new RefreshRequest(refresh), ct); } catch { }
        ClearTokens();
    }

    private async Task SaveTokensAsync(string access, string refresh)
    {
        await _secure.SetAsync(AccessKey, access);
        await _secure.SetAsync(RefreshKey, refresh);
    }
    private void ClearTokens() { _secure.Remove(AccessKey); _secure.Remove(RefreshKey); }
    private static string? ParseMessage(string raw) { try { using var d = JsonDocument.Parse(raw); return d.RootElement.TryGetProperty("message", out var p) ? p.GetString() : null; } catch { return null; } }
    private sealed class RegisterResponse { public UserDto? User { get; set; } }
    private static class JsonDefaults { public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web); }
}
