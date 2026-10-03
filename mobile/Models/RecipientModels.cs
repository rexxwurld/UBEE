namespace UBee.App.Models;

public sealed record LookupDto(string? AccountNumber, string? Fullname, bool IsSelf);

/// <summary>A row in the Recents / Favourites lists on the transfer screen.</summary>
public sealed class RecipientItem
{
    public string Name { get; init; } = "";
    public string AccountNumber { get; init; } = "";
    /// <summary>Set for other-bank recipients; empty for U-BEE accounts.</summary>
    public string BankName { get; init; } = "";
    public string Subtitle => string.IsNullOrEmpty(BankName) ? AccountNumber : $"{AccountNumber} · {BankName}";
    public string Initial => Name.Trim().Length > 0 ? Name.Trim()[..1].ToUpperInvariant() : "?";
}
