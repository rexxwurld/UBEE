using UBee.App.Models;
namespace UBee.App.Views;

[QueryProperty(nameof(Transaction), "tx")]
public partial class TransactionDetailsPage : ContentPage
{
    TransactionDto? _transaction;

    public TransactionDto? Transaction
    {
        get => _transaction;
        set { _transaction = value; BindingContext = value; }
    }

    public TransactionDetailsPage() => InitializeComponent();

    async void OnCopyTapped(object? sender, TappedEventArgs e)
    {
        if (Transaction?.Id is not { Length: > 0 } id) return;
        await Clipboard.Default.SetTextAsync(id);
        CopyLabel.Text = "Copied";
        await Task.Delay(1500);
        CopyLabel.Text = "Copy";
    }
}
