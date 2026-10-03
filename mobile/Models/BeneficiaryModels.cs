namespace UBee.App.Models;

public sealed class BeneficiaryDto
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "";
    public string AccountNumber { get; set; } = "";
    public string Bank { get; set; } = "";
}
