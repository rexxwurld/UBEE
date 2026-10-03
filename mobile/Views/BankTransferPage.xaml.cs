using UBee.App.ViewModels;
namespace UBee.App.Views;
public partial class BankTransferPage : ContentPage
{
    private readonly BankTransferViewModel _vm;
    public BankTransferPage(BankTransferViewModel vm) { InitializeComponent(); _vm = vm; BindingContext = vm; }
    protected override async void OnAppearing() { base.OnAppearing(); await _vm.LoadAsync(); }
}
