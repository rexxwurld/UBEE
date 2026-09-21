namespace UBee.App.Models;

public sealed record TransferRequest(string AccountNumber, decimal Amount, string? Description, string? Bank, string IdempotencyKey);
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
}
public sealed record PartyDto(string? Fullname, string? Email, string? AccountNumber);
public sealed class TransactionPageDto
{
    public bool Status { get; set; }
    public List<TransactionDto>? Data { get; set; }
    public string? NextCursor { get; set; }
}
