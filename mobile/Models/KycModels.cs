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
    public decimal DailyOutboundUsed { get; set; }
    public TierLimitDto? Limits { get; set; }
    public List<TierLimitDto>? Tiers { get; set; }
}
public sealed class TierLimitDto
{
    public string? Tier { get; set; }
    public decimal MaxSingleTransfer { get; set; }
    public decimal MaxDailyOutbound { get; set; }
    public decimal? MaxCumulativeBalance { get; set; }
}
public sealed class TierRow
{
    public string Label { get; init; } = "";
    public string Daily { get; init; } = "";
    public string Balance { get; init; } = "";
    public bool IsCurrent { get; init; }
}
