namespace UBee.App.Models;

public sealed record KycSubmitRequest(string? Bvn, string? Nin, string? DateOfBirth);
public sealed class KycStatusDto
{
    public string? UserId { get; set; }
    public string? KycTier { get; set; }
    public string? KycStatus { get; set; }
    public bool HasBvn { get; set; }
    public bool HasNin { get; set; }
    public DateTimeOffset? DateOfBirth { get; set; }
    public DateTimeOffset? KycSubmittedAt { get; set; }
    public DateTimeOffset? KycVerifiedAt { get; set; }
    public string? KycRejectionReason { get; set; }
}
