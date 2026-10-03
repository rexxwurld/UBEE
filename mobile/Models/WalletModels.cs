namespace UBee.App.Models;

public sealed record WalletDto(string? AccountNumber, decimal Balance, int? TotalTransactions, string? Status);
public sealed record WalletEnvelope(bool Status, WalletDto? Data, string? Message);
