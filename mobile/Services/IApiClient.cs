using UBee.App.Models;

namespace UBee.App.Services;

public interface IApiClient
{
    Task<ApiResult<T>> GetAsync<T>(string endpoint, CancellationToken ct = default);
    Task<ApiResult<TResponse>> PostAsync<TRequest, TResponse>(string endpoint, TRequest body, CancellationToken ct = default, string? idempotencyKey = null);
}
