namespace UBee.App.Models;

public sealed record TransferRequest(string AccountNumber, decimal Amount, string? Description, string? Bank, string IdempotencyKey, string Pin);
public sealed record TransferResponse(bool Status, string? Message, bool Duplicate, List<TransactionDto>? Data);
public sealed class TransactionDto
{
    public string? Id { get; set; }
    public DateTimeOffset? CreatedAt { get; set; }
    public string? Type { get; set; }
    public decimal Amount { get; set; }
    public string? Status { get; set; }
    public string? Description { get; set; }
    public string? Direction { get; set; }
    public string? Bank { get; set; }
    public string? AccountNumber { get; set; }
    public PartyDto? Sender { get; set; }
    public PartyDto? Receiver { get; set; }
    /// <summary>Charge on top of Amount (only outward bank transfers have one).</summary>
    public decimal Fee { get; set; }
    /// <summary>Recipient name for bank transfers (there is no receiving user to populate).</summary>
    public string? RecipientName { get; set; }

    // --- display helpers for the OPay-style lists ---
    public bool IsCredit => string.Equals(Direction, "received", StringComparison.OrdinalIgnoreCase) || string.Equals(Type, "credit", StringComparison.OrdinalIgnoreCase);
    public string Icon => IsCredit ? "ic_arrow_down_left.svg" : "ic_arrow_up_right.svg";
    public string AmountDisplay => $"{(IsCredit ? "+" : "-")}₦{Amount:N2}";
    public string Title => IsCredit
        ? (Sender?.Fullname is { Length: > 0 } s ? $"From {s}" : "Money received")
        : (Receiver?.Fullname is { Length: > 0 } r ? $"To {r}"
            : RecipientName is { Length: > 0 } rn ? $"To {rn}"
            : (AccountNumber is { Length: > 0 } a ? $"To {a}" : "Transfer"));
    public string Subtitle
    {
        get
        {
            var state = Status == "pending" ? "Processing" : Status == "failed" ? "Failed" : null;
            var bank = string.IsNullOrWhiteSpace(Bank) ? null : Bank;
            var detail = !string.IsNullOrWhiteSpace(Description) ? Description : CreatedAt?.ToLocalTime().ToString("dd MMM yyyy, HH:mm");
            return string.Join(" · ", new[] { state, bank, detail }.Where(x => !string.IsNullOrEmpty(x)));
        }
    }
}
public sealed record PartyDto(string? Fullname, string? Email, string? AccountNumber);
public sealed class TransactionPageDto
{
    public bool Status { get; set; }
    public List<TransactionDto>? Data { get; set; }
    public string? NextCursor { get; set; }
}
