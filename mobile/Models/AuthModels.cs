namespace UBee.App.Models;

public sealed class UserDto
{
    public string? Id { get; set; }
    public string? Fullname { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? AccountNumber { get; set; }
    public string? KycStatus { get; set; }
    public string? KycTier { get; set; }
    public DateTimeOffset? DateOfBirth { get; set; }

    /// <summary>"tier3" -> 3 (defaults to 1).</summary>
    public int TierNumber => KycTier is { Length: > 4 } t && int.TryParse(t[4..], out var n) ? n : 1;
}
public sealed record LoginRequest(string Phone, string Pin);
public sealed record RegisterRequest(string Fullname, string Email, string Phone, string Pin);
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
