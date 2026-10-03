using UBee.App.ViewModels;
namespace UBee.App.Views;

public partial class TransactionsPage : ContentPage
{
    readonly TransactionsViewModel vm;

    public TransactionsPage(TransactionsViewModel vm)
    {
        InitializeComponent();
        BindingContext = this.vm = vm;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        // Coming back from a transaction's details: keep the list (and scroll position) as it was.
        if (vm.SkipNextReload) { vm.SkipNextReload = false; return; }
        await vm.LoadAsync();
    }
}
