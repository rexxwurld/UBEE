using UBee.App.Models;

namespace UBee.App.Services;

public interface IAuthService
{
    Task<ApiResult<LoginResponse>> LoginAsync(string email, string password, CancellationToken ct = default);
    Task<ApiResult<UserDto>> RegisterAsync(RegisterRequest request, CancellationToken ct = default);
    Task<ApiResult<UserDto>> GetMeAsync(CancellationToken ct = default);
    Task<bool> RefreshAsync(string refreshToken, CancellationToken ct = default);
    Task<ApiResult<LoginResponse>> VerifyMfaAsync(string challengeId, string code, CancellationToken ct = default);
    Task<string?> GetAccessTokenAsync();
    Task<string?> GetRefreshTokenAsync();
    Task<bool> TryRestoreSessionAsync();
    Task LogoutAsync(CancellationToken ct = default);
}
