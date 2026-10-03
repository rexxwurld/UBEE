namespace UBee.App.Views;

/// <summary>Values for the two pickers on the Transactions screen ("all" is shown as "All Categories" / "All Status").</summary>
public static class TransactionFilters
{
    public static string[] Types => ["all", "sent", "received"];
    public static string[] Statuses => ["all", "pending", "success", "failed"];
}
