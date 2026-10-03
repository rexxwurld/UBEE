namespace UBee.App.Models;

public sealed record BankDto(string Code, string Name);
public sealed record NameEnquiryDto(string? AccountName, string? AccountNumber, string? BankCode);
public sealed record BankTransferRequest(string AccountNumber, string BankCode, long Amount, string? Description, string IdempotencyKey, string Pin);
public sealed record BankTransferResultDto(string? Id, string? Status, decimal Amount, decimal Fee, string? RecipientName, string? BankName, string? AccountNumber);
public sealed class BankTransferConfigDto
{
    public string? Provider { get; set; }
    public bool TestMode { get; set; }
    public decimal Fee { get; set; }
    public int FreePerDay { get; set; }
    public int FreeRemaining { get; set; }
    public decimal MinAmount { get; set; }
}
