namespace UBee.App.Models;

public sealed record ApiError(string Code, string Message, int? StatusCode = null);
public sealed class ApiResult<T>
{
    public bool Success { get; init; }
    public T? Data { get; init; }
    public ApiError? Error { get; init; }
    public static ApiResult<T> Ok(T data) => new() { Success = true, Data = data };
    public static ApiResult<T> Fail(string message, string code = "request_failed", int? statusCode = null) => new() { Success = false, Error = new ApiError(code, message, statusCode) };
}
