using UBee.App.ViewModels;
namespace UBee.App.Views;
public partial class TransferPage : ContentPage
{
    private readonly TransferViewModel _vm;
    public TransferPage(TransferViewModel vm) { InitializeComponent(); _vm = vm; BindingContext = vm; }
    protected override async void OnAppearing() { base.OnAppearing(); await _vm.LoadAsync(); }
}
