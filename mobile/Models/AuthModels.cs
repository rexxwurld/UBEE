namespace UBee.App.Models;

public sealed record UserDto(string? Id, string? Fullname, string? Email, string? Phone, string? KycStatus, string? KycTier);
public sealed record LoginRequest(string Email, string Password);
public sealed record RegisterRequest(string Fullname, string Email, string Phone, string Password);
public sealed record TokenPair(string AccessToken, string RefreshToken, int? ExpiresIn);
public sealed class LoginResponse
{
    public string? Message { get; set; }
    public UserDto? User { get; set; }
    public string? AccessToken { get; set; }
    public string? RefreshToken { get; set; }
    public int? ExpiresIn { get; set; }
    public bool MfaRequired { get; set; }
    public string? ChallengeId { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
}
public sealed record RefreshRequest(string RefreshToken);
