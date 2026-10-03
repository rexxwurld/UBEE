using System.Globalization;
using System.Text.Json.Serialization;

namespace UBee.App.Models;

public sealed record TransferRequest(string AccountNumber, decimal Amount, string? Description, string? Bank, string IdempotencyKey, string Pin);
public sealed record TransferResponse(bool Status, string? Message, bool Duplicate, List<TransactionDto>? Data);
public sealed class TransactionDto
{
    [JsonPropertyName("_id")]
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

    // --- Transactions list + details screens ---

    /// <summary>"success" | "pending" | "failed" - drives the status chip colours in XAML.</summary>
    public string StatusKind => (Status ?? "").ToLowerInvariant() switch
    {
        "pending" => "pending",
        "failed" or "rejected" => "failed",
        _ => "success"
    };
    public string StatusLabel => StatusKind switch { "pending" => "Processing", "failed" => "Failed", _ => "Successful" };

    /// <summary>"Transfer to ADA OKAFOR" / "Transfer from ADA OKAFOR".</summary>
    public string Headline => Title switch
    {
        var t when t.StartsWith("To ") => "Transfer to " + t[3..],
        var t when t.StartsWith("From ") => "Transfer from " + t[5..],
        var t => t
    };

    /// <summary>"Oct 3rd, 12:43:54"</summary>
    public string TimeDisplay => CreatedAt is { } t ? Format(t.ToLocalTime(), withYear: false) : "";
    /// <summary>"Oct 3rd, 2026 12:43:54"</summary>
    public string DateDisplay => CreatedAt is { } t ? Format(t.ToLocalTime(), withYear: true) : "—";
    /// <summary>Group key for the month headers, e.g. "Oct 2026".</summary>
    public string MonthKey => CreatedAt is { } t ? t.ToLocalTime().ToString("MMM yyyy", CultureInfo.InvariantCulture) : "Earlier";

    private static string Format(DateTimeOffset t, bool withYear)
    {
        var d = t.Day;
        var suffix = d is >= 11 and <= 13 ? "th" : (d % 10) switch { 1 => "st", 2 => "nd", 3 => "rd", _ => "th" };
        var month = t.ToString("MMM", CultureInfo.InvariantCulture);
        var time = t.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
        return withYear ? $"{month} {d}{suffix}, {t.Year} {time}" : $"{month} {d}{suffix}, {time}";
    }

    // --- details screen ---
    public string DetailAmount => $"₦{Amount:N2}";
    public string TypeDisplay => (Type ?? "").ToLowerInvariant() switch
    {
        "deposit" => "Deposit",
        "payout" => "Bank transfer",
        "refund" => "Refund",
        "credit" => "Credit",
        "transfer" => IsCredit ? "Transfer received" : "Transfer sent",
        _ => IsCredit ? "Money received" : "Transfer"
    };
    public string CounterpartyLabel => IsCredit ? "Sender" : "Recipient";
    public string? CounterpartyName => IsCredit ? Sender?.Fullname : (Receiver?.Fullname ?? RecipientName);
    public string? CounterpartyAccount => IsCredit ? Sender?.AccountNumber : (Receiver?.AccountNumber ?? AccountNumber);
    public bool HasCounterpartyName => !string.IsNullOrWhiteSpace(CounterpartyName);
    public bool HasCounterpartyAccount => !string.IsNullOrWhiteSpace(CounterpartyAccount);
    public bool HasBank => !string.IsNullOrWhiteSpace(Bank);
    public bool HasDescription => !string.IsNullOrWhiteSpace(Description);
    public bool ShowFee => !IsCredit && Fee > 0;
    public string FeeDisplay => $"₦{Fee:N2}";
    public string TotalDisplay => $"₦{Amount + Fee:N2}";
}
public sealed record PartyDto(string? Fullname, string? Email, string? AccountNumber);
public sealed class TransactionPageDto
{
    public bool Status { get; set; }
    public List<TransactionDto>? Data { get; set; }
    public string? NextCursor { get; set; }
}
